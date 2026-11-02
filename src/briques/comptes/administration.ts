import { ROLE_ADMIN, ROLES } from "@/config/acces";
import { envoyerMail } from "@/briques/mails/envoi";
import { query, transaction, type ExecuteurSql } from "@/lib/db/client";
import {
  COLONNES_ENTREE,
  contexteDeLAppli,
  domaineDe,
  enBaseDe,
  estAdresseDeDemo,
  normaliser,
  origineDuCompte,
  roleEffectif,
  type CompteAdmis,
  type ContexteEntree,
  type LigneEntree,
  type OrigineDuCompte,
} from "./entree";
import { fermerLesSessionsDe } from "./session";

/*
 * L'administration des comptes dans l'appli : le niveau 3 des
 * droits, pour un client qui gère lui-même ses utilisateurs. L'écran vit dans
 * la brique gestion-comptes, optionnelle ; les règles vivent ici, à côté des
 * tables qu'elles protègent. Sans l'écran, rien ne les appelle : la colonne
 * gere_par_l_appli reste à faux et domaines_admis vide, c'est le niveau 2.
 *
 * Pièges repris d'un projet précédent :
 *   - le dernier admin actif ne se désactive ni ne se rétrograde, ni par
 *     l'écran (protege), ni par une action postée à la main (ici) ;
 *   - on désactive un compte, on ne le supprime pas ;
 *   - un rôle changé agit à la requête suivante (relu en base, roles.ts).
 *
 * Chaque écriture est UNE transaction, sous un même verrou. La trace d'un
 * geste (Trace, plus bas) s'y écrit avec l'effet : ensemble ou pas du tout.
 */

export type StatutDuCompte = "actif" | "desactive" | "sans-acces";

export type CompteAdministre = {
  id: number;
  email: string;
  // Le rôle qui s'applique (celui de la configuration pour une adresse
  // listée), ou celui en base pour un compte qui n'entre plus.
  role: string;
  origine: OrigineDuCompte;
  // « sans-acces » : actif, mais plus rien ne l'admet (adresse retirée de la
  // configuration, domaine fermé).
  statut: StatutDuCompte;
  derniereConnexion: Date | null;
  creeLe: Date;
  // Le dernier admin actif : l'écran ne lui propose ni désactivation ni autre
  // rôle (la première porte ; la seconde est dans chaque écriture).
  protege: boolean;
};

export type DomaineAdministre = {
  domaine: string;
  // « configuration » : ENTREE.domaines, qui ne se ferme pas d'ici.
  origine: "configuration" | "appli";
  ouvert: boolean;
  comptesActifs: number;
  // Ce que la fermeture retirerait : les comptes entrés par le domaine que
  // l'appli ne gère pas. La modale de fermeture le dit avant.
  comptesQuiPerdraientLAcces: number;
};

export type Refus = { erreur: string };

// Ce qu'il faut pour écrire le mail d'invitation : l'appli le sait (NOM_APP,
// URL_PUBLIQUE), pas la brique.
export type Prevenir = { nomDeLAppli: string; adresseDeConnexion: string | null };

export type Invitation = { compte: CompteAdmis; mail: "parti" | "en-echec" | "non-demande" };

// La connexion de la transaction d'une écriture.
type Transaction = Parameters<Parameters<typeof transaction>[0]>[0];

// Ce qu'un geste qui a changé quelque chose laisse à tracer, dans la forme
// d'un événement de la brique journal d'audit. Un compte se désigne par son
// numéro, jamais par son adresse : le journal ne garde aucune donnée
// personnelle dans une référence.
export type Geste = {
  action: "creation" | "modification";
  entite: "compte" | "domaine";
  entiteId: number | string;
  libelle: string;
  // Les noms des colonnes changées, pour une modification.
  champs?: string[];
};

// Appelée sous le verrou, dans la transaction du geste, après son effet : une
// trace qui lève annule le geste. Comptes ne peut pas importer le journal,
// qui l'exige : c'est l'appelant (les actions de /comptes) qui la passe.
export type Trace = (tx: Transaction, geste: Geste) => Promise<void>;

const surLeCompte = (id: number): Pick<Geste, "entite" | "entiteId" | "libelle"> => ({
  entite: "compte",
  entiteId: id,
  libelle: `compte n°${id}`,
});

const surLeDomaine = (domaine: string): Pick<Geste, "entite" | "entiteId" | "libelle"> => ({
  entite: "domaine",
  entiteId: domaine,
  libelle: domaine,
});

// Un geste qui ne change rien (réactiver un compte actif, redonner le même
// rôle) n'a rien à tracer.
async function tracerLaModification(
  trace: Trace | undefined,
  client: Transaction,
  cible: Pick<Geste, "entite" | "entiteId" | "libelle">,
  champs: string[]
): Promise<void> {
  if (trace && champs.length > 0) await trace(client, { action: "modification", ...cible, champs });
}

// Les colonnes que l'écriture change vraiment, dans l'ordre où elle les écrit.
function champsChanges<T extends object>(avant: T, apres: Partial<T>): string[] {
  return (Object.keys(apres) as (keyof T)[]).filter((champ) => avant[champ] !== apres[champ]).map(String);
}

type LigneCompte = LigneEntree & { id: number; derniere_connexion: Date | null; cree_le: Date };

const SELECT_COMPTES = `SELECT u.id, ${COLONNES_ENTREE}, u.derniere_connexion, u.cree_le FROM utilisateurs u`;

const INTROUVABLE: Refus = { erreur: "Ce compte est introuvable : la liste a peut-être changé, rechargez la page." };
// Un compte de démo n'existe nulle part : la démo le recrée à la demande, et
// géré par l'appli il serait entré même sans la démo.
const DEMO: Refus = { erreur: "Un compte de démo ne s'administre pas." };
const DERNIER_ADMIN: Refus = {
  erreur: "C'est le dernier compte administrateur actif : donnez d'abord le rôle d'administration à un autre compte.",
};

// Des domaines où n'importe qui ouvre une adresse : les ouvrir ouvrirait
// l'appli à tout le monde. Les familles à plusieurs extensions (hotmail.fr,
// yahoo.co.uk) se reconnaissent par leur nom.
const MESSAGERIES_PUBLIQUES = [
  /^g(oogle)?mail\.com$/,
  /^(outlook|hotmail|live|msn)\.[a-z.]+$/,
  /^yahoo\.[a-z.]+$/,
  /^(icloud|me|mac|aol|zoho)\.com$/,
  /^(orange|wanadoo|free|sfr|neuf|bbox|laposte)\.(fr|net)$/,
  /^(proton|protonmail|pm)\.(me|com|ch)$/,
  /^(gmx|yandex|tutanota)\.[a-z.]+$/,
  /^(web\.de|mail\.ru)$/,
];

// Des étiquettes de lettres, chiffres et tirets, au moins deux : « client »
// seul, « client..fr » ou un domaine précédé d'un « @ » sont refusés.
const FORME_DOMAINE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const FORME_ADRESSE = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function estRole(role: string): boolean {
  return (ROLES as readonly string[]).includes(role);
}

function estAdminActif(ligne: LigneCompte, contexte: ContexteEntree): boolean {
  return (
    ligne.actif &&
    !estAdresseDeDemo(ligne.email) &&
    roleEffectif(ligne.email, ligne.role, contexte, enBaseDe(ligne)) === ROLE_ADMIN
  );
}

// Toutes les écritures passent une par une. Sans le verrou, deux admins qui se
// rétrogradent l'un l'autre au même instant lisent chacun deux admins, et
// passent tous deux : il n'en reste aucun.
async function verrouiller(client: ExecuteurSql): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["comptes:administration"]);
}

async function sousVerrou<T>(ecriture: (client: Transaction) => Promise<T>): Promise<T> {
  return transaction(async (client) => {
    await verrouiller(client);
    return ecriture(client);
  });
}

// Vrai si l'écriture laisse au moins un admin actif, ou s'il n'y en avait
// déjà aucun. Lu sous le verrou, dans la transaction : l'état laissé par
// l'écriture précédente. Les admins listés dans la configuration comptent :
// c'est le rôle EFFECTIF qui se lit, pas la colonne.
async function laisseUnAdmin(
  client: ExecuteurSql,
  contexte: ContexteEntree,
  apres: (ligne: LigneCompte) => LigneCompte
): Promise<boolean> {
  const lignes = await client.query<LigneCompte>(`${SELECT_COMPTES} WHERE u.actif`);
  const avant = lignes.filter((ligne) => estAdminActif(ligne, contexte)).length;
  return avant === 0 || lignes.some((ligne) => estAdminActif(apres(ligne), contexte));
}

export async function listerComptes(contexte = contexteDeLAppli()): Promise<CompteAdministre[]> {
  const lignes = await query<LigneCompte>(`${SELECT_COMPTES} ORDER BY u.email`);
  const admins = lignes.filter((ligne) => estAdminActif(ligne, contexte));
  return lignes.map((ligne) => {
    const effectif = roleEffectif(ligne.email, ligne.role, contexte, enBaseDe(ligne));
    return {
      id: ligne.id,
      email: ligne.email,
      role: effectif ?? ligne.role,
      origine: origineDuCompte(ligne.email, contexte, enBaseDe(ligne)),
      statut: !ligne.actif ? "desactive" : effectif === null ? "sans-acces" : "actif",
      derniereConnexion: ligne.derniere_connexion,
      creeLe: ligne.cree_le,
      protege: admins.length === 1 && admins[0].id === ligne.id,
    };
  });
}

export async function listerDomaines(contexte = contexteDeLAppli()): Promise<DomaineAdministre[]> {
  const enBase = await query<{ domaine: string; actif: boolean }>(
    "SELECT domaine, actif FROM domaines_admis ORDER BY domaine"
  );
  const actifs = await query<LigneCompte>(`${SELECT_COMPTES} WHERE u.actif`);
  const configures = contexte.entree.domaines.map(normaliser);
  const domaines: Omit<DomaineAdministre, "comptesActifs" | "comptesQuiPerdraientLAcces">[] = [
    ...configures.map((domaine) => ({ domaine, origine: "configuration" as const, ouvert: true })),
    ...enBase
      .filter((ligne) => !configures.includes(ligne.domaine))
      .map((ligne) => ({ domaine: ligne.domaine, origine: "appli" as const, ouvert: ligne.actif })),
  ];
  return domaines.map((domaine) => {
    const admis = actifs.filter(
      (ligne) =>
        domaineDe(ligne.email) === domaine.domaine &&
        roleEffectif(ligne.email, ligne.role, contexte, enBaseDe(ligne)) !== null
    );
    const perdraient =
      domaine.origine === "appli" && domaine.ouvert
        ? admis.filter(
            (ligne) =>
              roleEffectif(ligne.email, ligne.role, contexte, { ...enBaseDe(ligne), domaineOuvert: false }) === null
          )
        : [];
    return { ...domaine, comptesActifs: admis.length, comptesQuiPerdraientLAcces: perdraient.length };
  });
}

// Crée le compte, admis tout de suite et géré par l'appli. Le mail, s'il est
// demandé, ne fait qu'informer (l'adresse de la page de connexion) : ni code
// ni lien qui connecte, l'identité se vérifie toujours par une méthode de
// connexion. Un envoi en échec ne défait
// pas l'invitation : l'écran le dit, l'admin prévient la personne.
export async function inviter(
  email: string,
  role: string,
  prevenir: Prevenir | null,
  trace?: Trace
): Promise<Invitation | Refus> {
  const adresse = normaliser(email);
  if (!FORME_ADRESSE.test(adresse)) return { erreur: "Adresse invalide : attendu nom@domaine.ext, sans espace." };
  if (estAdresseDeDemo(adresse)) return { erreur: "Une adresse de démo ne s'invite pas : elle n'existe nulle part." };
  if (!estRole(role)) return { erreur: "Ce rôle n'est pas déclaré dans la configuration (src/config/acces.ts)." };
  // Le mail part après la transaction : une trace en échec n'a rien annoncé.
  const compte = await sousVerrou(async (client) => {
    const [cree] = await client.query<CompteAdmis>(
      `INSERT INTO utilisateurs (email, role, gere_par_l_appli) VALUES ($1, $2, true)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, role`,
      [adresse, role]
    );
    if (cree && trace) await trace(client, { action: "creation", ...surLeCompte(cree.id) });
    return cree ?? null;
  });
  if (!compte) return { erreur: "Ce compte existe déjà : changez son rôle ou réactivez-le depuis sa ligne." };
  if (!prevenir) return { compte, mail: "non-demande" };
  try {
    await envoyerMail({
      a: adresse,
      objet: `Vous avez accès à ${prevenir.nomDeLAppli}`,
      contenu: [
        { paragraphe: `Un compte vient de vous être ouvert sur ${prevenir.nomDeLAppli}, pour cette adresse e-mail.` },
        ...(prevenir.adresseDeConnexion
          ? [{ lien: { libelle: "Aller à la page de connexion", url: prevenir.adresseDeConnexion } }]
          : []),
        { paragraphe: "Connectez-vous avec cette adresse, par une méthode que propose la page de connexion." },
        { paragraphe: "Si vous ne vous attendiez pas à ce message, vous pouvez l'ignorer." },
      ],
    });
    return { compte, mail: "parti" };
  } catch (erreur) {
    // Le message des briques ne cite jamais l'adresse ni le contenu.
    console.error(
      "Brique comptes : l'envoi d'une invitation a échoué :",
      erreur instanceof Error ? erreur.message : "erreur inconnue"
    );
    return { compte, mail: "en-echec" };
  }
}

// Le rôle choisi s'écrit, et le compte passe géré par l'appli : pour une
// adresse listée, la configuration ne s'applique plus à elle.
export async function changerRole(
  id: number,
  role: string,
  contexte = contexteDeLAppli(),
  trace?: Trace
): Promise<Refus | undefined> {
  if (!estRole(role)) return { erreur: "Ce rôle n'est pas déclaré dans la configuration (src/config/acces.ts)." };
  return sousVerrou(async (client) => {
    const [cible] = await client.query<LigneCompte>(`${SELECT_COMPTES} WHERE u.id = $1`, [id]);
    if (!cible) return INTROUVABLE;
    if (estAdresseDeDemo(cible.email)) return DEMO;
    const apres = (ligne: LigneCompte) => (ligne.id === id ? { ...ligne, role, gere_par_l_appli: true } : ligne);
    if (!(await laisseUnAdmin(client, contexte, apres))) return DERNIER_ADMIN;
    await client.query("UPDATE utilisateurs SET role = $2, gere_par_l_appli = true WHERE id = $1", [id, role]);
    await tracerLaModification(trace, client, surLeCompte(id), champsChanges(cible, { role, gere_par_l_appli: true }));
  });
}

// La personne est dehors à la requête suivante (lireSessionDe lit actif), et
// ses sessions se ferment avec le compte.
export async function desactiver(id: number, contexte = contexteDeLAppli(), trace?: Trace): Promise<Refus | undefined> {
  return sousVerrou(async (client) => {
    const [cible] = await client.query<LigneCompte>(`${SELECT_COMPTES} WHERE u.id = $1`, [id]);
    if (!cible) return INTROUVABLE;
    if (estAdresseDeDemo(cible.email)) return DEMO;
    const apres = (ligne: LigneCompte) => (ligne.id === id ? { ...ligne, actif: false } : ligne);
    if (!(await laisseUnAdmin(client, contexte, apres))) return DERNIER_ADMIN;
    await client.query("UPDATE utilisateurs SET actif = false WHERE id = $1", [id]);
    await fermerLesSessionsDe(client, id);
    await tracerLaModification(trace, client, surLeCompte(id), champsChanges(cible, { actif: false }));
  });
}

// Rien d'autre ne change : un compte que plus rien n'admet reste « sans
// accès », et l'admin peut alors lui donner un rôle.
export async function reactiver(id: number, trace?: Trace): Promise<Refus | undefined> {
  return sousVerrou(async (client) => {
    const [cible] = await client.query<{ email: string; actif: boolean }>(
      "SELECT email, actif FROM utilisateurs WHERE id = $1",
      [id]
    );
    if (!cible) return INTROUVABLE;
    if (estAdresseDeDemo(cible.email)) return DEMO;
    await client.query("UPDATE utilisateurs SET actif = true WHERE id = $1", [id]);
    await tracerLaModification(trace, client, surLeCompte(id), champsChanges(cible, { actif: true }));
  });
}

function refusDuDomaine(domaine: string, contexte: ContexteEntree): Refus | null {
  if (!FORME_DOMAINE.test(domaine)) return { erreur: "Domaine invalide : attendu client.fr, sans « @ » ni espace." };
  if (estAdresseDeDemo(`x@${domaine}`)) return { erreur: "Le domaine de démo ne s'ouvre pas." };
  if (contexte.entree.domaines.some((configure) => normaliser(configure) === domaine)) {
    return { erreur: "Ce domaine est dans la configuration (src/config/comptes.ts) : il s'y ouvre et s'y ferme." };
  }
  return null;
}

export async function ouvrirDomaine(
  saisi: string,
  contexte = contexteDeLAppli(),
  trace?: Trace
): Promise<Refus | undefined> {
  const domaine = normaliser(saisi);
  const refus = refusDuDomaine(domaine, contexte);
  if (refus) return refus;
  if (MESSAGERIES_PUBLIQUES.some((motif) => motif.test(domaine))) {
    return {
      erreur:
        "C'est une messagerie publique : l'ouvrir laisserait entrer n'importe qui. Invitez les adresses une par une.",
    };
  }
  await sousVerrou(async (client) => {
    const [avant] = await client.query<{ actif: boolean }>("SELECT actif FROM domaines_admis WHERE domaine = $1", [
      domaine,
    ]);
    await client.query(
      "INSERT INTO domaines_admis (domaine) VALUES ($1) ON CONFLICT (domaine) DO UPDATE SET actif = true",
      [domaine]
    );
    // Rouvrir un domaine fermé le modifie : sa ligne existait déjà.
    if (!avant && trace) await trace(client, { action: "creation", ...surLeDomaine(domaine) });
    if (avant) await tracerLaModification(trace, client, surLeDomaine(domaine), champsChanges(avant, { actif: true }));
  });
}

// Les comptes entrés par le domaine et que l'appli ne gère pas perdent
// l'accès, comme au niveau 2 quand un domaine sort de la configuration. Le
// dernier admin peut être l'un d'eux : la fermeture est alors refusée.
export async function fermerDomaine(
  saisi: string,
  contexte = contexteDeLAppli(),
  trace?: Trace
): Promise<Refus | undefined> {
  const domaine = normaliser(saisi);
  const refus = refusDuDomaine(domaine, contexte);
  if (refus) return refus;
  return sousVerrou(async (client) => {
    const [ligne] = await client.query<{ actif: boolean }>("SELECT actif FROM domaines_admis WHERE domaine = $1", [
      domaine,
    ]);
    if (!ligne?.actif) return { erreur: "Ce domaine n'est pas ouvert." };
    const apres = (compte: LigneCompte) =>
      domaineDe(compte.email) === domaine ? { ...compte, domaine_ouvert: false } : compte;
    if (!(await laisseUnAdmin(client, contexte, apres))) return DERNIER_ADMIN;
    await client.query("UPDATE domaines_admis SET actif = false WHERE domaine = $1", [domaine]);
    await tracerLaModification(trace, client, surLeDomaine(domaine), ["actif"]);
  });
}

export type CompteAnonymise = { id: number; geste: Geste; avertissement?: string };

// L'adresse d'un compte anonymisé : unique comme le veut la colonne, en
// minuscules comme le veut sa contrainte, et sur un domaine réservé
// (.invalid) : aucun mail n'y arrive, aucune méthode de connexion ne la prouve.
export function adresseAnonymisee(id: number): string {
  return `efface-${id}@efface.invalid`;
}

// L'effacement des données d'une personne (brique rgpd), dans la transaction
// de l'appelant. Le compte s'anonymise, il ne se supprime pas : ce qui le
// désigne par son numéro (le journal d'audit, en ON DELETE RESTRICT) reste en
// place et ne mène plus à l'adresse. Mêmes portes que la désactivation : le
// verrou, le dernier admin actif, les comptes de démo. null : aucun compte
// pour cette adresse.
//
// Une adresse écrite dans la configuration (adresses de ENTREE, premier admin)
// rentrerait avec un compte neuf à sa prochaine connexion, et reste dans le
// code : l'effacement se fait, l'avertissement dit de la retirer.
export async function anonymiserLeCompte(
  client: ExecuteurSql,
  email: string,
  contexte = contexteDeLAppli()
): Promise<CompteAnonymise | Refus | null> {
  const adresse = normaliser(email);
  await verrouiller(client);
  const [cible] = await client.query<LigneCompte>(`${SELECT_COMPTES} WHERE u.email = $1`, [adresse]);
  if (!cible) return null;
  if (estAdresseDeDemo(cible.email)) return DEMO;
  const apres = (ligne: LigneCompte) => (ligne.id === cible.id ? { ...ligne, actif: false } : ligne);
  if (!(await laisseUnAdmin(client, contexte, apres))) return DERNIER_ADMIN;
  const anonyme = {
    email: adresseAnonymisee(cible.id),
    actif: false,
    gere_par_l_appli: false,
    derniere_connexion: null,
  };
  await client.query(
    `UPDATE utilisateurs SET email = $2, actif = false, gere_par_l_appli = false, derniere_connexion = NULL WHERE id = $1`,
    [cible.id, anonyme.email]
  );
  const avertissement = avertissementDeConfiguration(adresse, contexte);
  return {
    id: cible.id,
    geste: { action: "modification", ...surLeCompte(cible.id), champs: champsChanges(cible, anonyme) },
    ...(avertissement ? { avertissement } : {}),
  };
}

// Ce qu'il reste à retirer à la main quand l'adresse est écrite dans la
// configuration, qu'elle ait un compte en base ou non : une adresse listée
// jamais connectée reste, elle aussi, dans le code. null sinon.
export function avertissementDeConfiguration(email: string, contexte = contexteDeLAppli()): string | null {
  const origine = origineDuCompte(normaliser(email), contexte);
  if (origine === "configuration") {
    return "Cette adresse est écrite dans la configuration des comptes (src/config/comptes.ts) : la retirer, sinon elle reste dans le code et entre avec un compte neuf à sa prochaine connexion.";
  }
  if (origine === "premier-admin") {
    return "Cette adresse est celle du premier admin (variable COMPTES_PREMIER_ADMIN) : la retirer chez l'hébergeur, sinon elle entre avec un compte neuf à sa prochaine connexion.";
  }
  return null;
}
