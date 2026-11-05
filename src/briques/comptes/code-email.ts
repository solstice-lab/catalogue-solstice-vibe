import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { envoyerMail } from "@/briques/mails/envoi";
import { LIMITES_PAR_RESEAU } from "@/config/comptes";
import { transaction } from "@/lib/db/client";
import { admettre, contexteDeLAppli, normaliser, seraitAdmis, type ContexteEntree } from "./entree";
import { secretDeSession } from "./jeton";
import { refuserDesLimitesParReseauInvalides } from "./methodes";
import { ouvrirSession } from "./session";

/*
 * La connexion par code à 6 chiffres envoyé par e-mail, la
 * méthode par défaut. Reprise d'un projet précédent, où elle a tourné en
 * production, avec ses corrections :
 * - la réponse n'attend pas l'envoi, ni même la question « l'adresse
 *   est-elle admise ? » : attendre l'envoi rendait la réponse plus lente pour
 *   une adresse connue, ce qui suffisait à la trahir ;
 * - la réponse est la même que l'adresse soit admise ou non, et les limites
 *   aussi : une adresse inconnue a sa ligne en base, seul le mail ne part pas ;
 * - les limites se comptent en base, par adresse ET par adresse IP : chez
 *   l'hébergeur, plusieurs processus servent l'appli et chacun aurait compté
 *   de son côté.
 *
 * Seules des empreintes sont stockées : celle du code (une fuite de la base
 * ne connecte personne), celle de l'adresse (les adresses saisies sans compte
 * sont celles de personnes qui n'utilisent pas l'appli) et celle de l'IP.
 */

// Le code et sa vie.
export const DUREE_VALIDITE_MINUTES = 10;
export const ESSAIS_MAX = 3;

// Les limites de demandes, sur une heure glissante.
// Une adresse depuis une même IP : pas plus d'une demande par minute, cinq par
// heure. Comptées par adresse seule, cinq demandes d'un tiers suffisaient à
// tenir la personne dehors une heure.
export const DELAI_ENTRE_DEMANDES_S = 60;
export const DEMANDES_PAR_HEURE_ADRESSE_IP = 5;
// Les deux limites par IP ne sont pas ici : elles se règlent par appli
// (LIMITES_PAR_RESEAU de src/config/comptes.ts), car tout un réseau partage une IP
// et le nombre de personnes qui s'y connectent dans l'heure dépend de l'appli.
// - Les demandes d'une IP, toutes adresses confondues : borne qui essaie des
//   milliers d'adresses.
// - Les saisies fausses d'une IP, toutes adresses confondues. Sans elle, trois
//   essais d'une seule IP invalidaient le code en cours de n'importe qui, pour
//   des milliers d'adresses, et « expiré » contre « incorrect » disait qui se
//   connectait à l'instant. Une fois atteinte, plus aucun code n'est lu depuis
//   cette IP : ni invalidé, ni sondé.
// Une adresse, toutes IP confondues : sans elle, qui dispose de beaucoup d'IP
// demande 5 codes par heure et par IP, et 3 essais chacun, sans fin. Avec
// elle, au plus 30 essais par heure sur un million de codes. Le prix : qui a
// plusieurs IP peut tenir une adresse dehors une heure.
export const DEMANDES_PAR_HEURE_ADRESSE = 10;

// Les lignes ne servent qu'aux limites et au code en cours : une heure suffit.
const CONSERVATION_S = 3_600;

export type ResultatDemande = "envoye" | "limite";
export type ResultatConnexion = "connecte" | "incorrect" | "epuise" | "expire" | "acces" | "limite";

// Ce qui se fait après la réponse : after() de Next dans l'action.
export type Planifier = (tache: () => Promise<void>) => void;

// 254 : la longueur maximale d'une adresse (RFC 5321). Sans plafond, chaque
// demande écrivait en base une chaîne de n'importe quelle taille (projet
// précédent). La vérification fine est celle de la brique mails, à l'envoi.
export function adresseValide(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Une empreinte à clé : sans AUTH_SECRET, l'empreinte d'un code à 6 chiffres
// se retrouverait en un million d'essais hors ligne, et celle d'une adresse
// en essayant un annuaire. Exportée pour la connexion par lien (lien-email.ts).
export function empreinte(secret: string, valeur: string): string {
  return createHmac("sha256", secret).update(valeur).digest("hex");
}

function empreinteDuCode(secret: string, adresse: string, code: string): string {
  return empreinte(secret, `code:${adresse}:${code}`);
}

// Exportée pour l'export des données d'une personne (donnees-personnelles.ts) :
// ses demandes de code ne se retrouvent qu'en recalculant cette empreinte.
export function empreinteDeLAdresse(secret: string, adresse: string): string {
  return empreinte(secret, `adresse:${adresse}`);
}

// À clé aussi : sans elle, les 2^32 adresses IPv4 se retrouvent en quelques
// secondes. null quand l'IP ne se lit pas (voir plus bas).
function empreinteDeLIp(secret: string, ip: string | null): string | null {
  return ip === null ? null : empreinte(secret, `ip:${ip}`);
}

/*
 * Écrit une demande de code pour cette adresse, ou refuse si une limite est
 * atteinte, sans jamais chercher à savoir si l'adresse est admise : cela se
 * fait dans la tâche planifiée, après la réponse, avec l'envoi.
 *
 * `ip` vaut null quand l'adresse du visiteur ne se lit pas de façon sûre en
 * production (src/lib/adresse-ip.ts) : la limite par IP saute, elle bloquerait
 * tout le monde d'un coup ; celles par adresse restent, toutes les demandes
 * comptant alors comme venues de la même IP.
 */
export async function demanderUnCode(
  email: string,
  ip: string | null,
  planifier: Planifier,
  contexte = contexteDeLAppli()
): Promise<ResultatDemande> {
  const adresse = normaliser(email);
  // Avant toute écriture : sans secret valable, rien ne s'écrit à moitié.
  const secret = secretDeSession();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const acceptee = await enregistrerUneDemande(
    secret,
    adresse,
    ip,
    empreinteDuCode(secret, adresse, code),
    DUREE_VALIDITE_MINUTES
  );
  if (!acceptee) return "limite";

  planifier(() => envoyerSiAdmis(adresse, code, contexte));
  return "envoye";
}

/*
 * Écrit la demande sous les limites, ou répond faux si l'une est atteinte.
 * Partagée avec la connexion par lien (lien-email.ts) : un lien et un code
 * sont deux lignes de la même table, comptées ensemble. Sans cela, une appli
 * qui propose les deux méthodes doublait les mails qu'un tiers peut faire
 * envoyer à une personne. `empreinteSecrete` est celle du code ou du lien.
 */
export async function enregistrerUneDemande(
  secret: string,
  adresse: string,
  ip: string | null,
  empreinteSecrete: string,
  dureeMinutes: number
): Promise<boolean> {
  const cleAdresse = empreinteDeLAdresse(secret, adresse);
  const cleIp = empreinteDeLIp(secret, ip);
  // Lue avant la transaction : une valeur refusée ne laisse aucun verrou pris.
  const limites = refuserDesLimitesParReseauInvalides(LIMITES_PAR_RESEAU);
  return transaction(async (client) => {
    // Deux demandes simultanées liraient sinon le même compte et passeraient
    // toutes deux sous la limite. Toujours l'adresse puis l'IP : pris dans le
    // même ordre, les verrous ne s'interbloquent pas.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`codes_connexion:adresse:${cleAdresse}`]);
    if (cleIp !== null)
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`codes_connexion:ip:${cleIp}`]);
    // Ménage à chaque demande, plutôt qu'une tâche planifiée à part.
    await client.query("DELETE FROM codes_connexion WHERE cree_le < now() - make_interval(secs => $1)", [
      CONSERVATION_S,
    ]);

    const compte = await client.queryOne<{ minute: number; adresse_ip: number; adresse: number; ip: number }>(
      `SELECT count(*) FILTER (WHERE adresse_empreinte = $1 AND ip_empreinte IS NOT DISTINCT FROM $2
                                 AND cree_le > now() - make_interval(secs => $3))::int AS minute,
              count(*) FILTER (WHERE adresse_empreinte = $1 AND ip_empreinte IS NOT DISTINCT FROM $2)::int AS adresse_ip,
              count(*) FILTER (WHERE adresse_empreinte = $1)::int AS adresse,
              count(*) FILTER (WHERE ip_empreinte = $2)::int AS ip
         FROM codes_connexion
        WHERE adresse_empreinte = $1 OR ip_empreinte = $2`,
      [cleAdresse, cleIp, DELAI_ENTRE_DEMANDES_S]
    );
    if (
      !compte ||
      compte.minute > 0 ||
      compte.adresse_ip >= DEMANDES_PAR_HEURE_ADRESSE_IP ||
      compte.adresse >= DEMANDES_PAR_HEURE_ADRESSE ||
      compte.ip >= limites.demandesParHeure
    ) {
      return false;
    }

    // Un nouveau code invalide le précédent : seul le dernier reçu vaut. Un
    // lien aussi, et l'un invalide l'autre.
    await client.query("UPDATE codes_connexion SET consomme = true WHERE adresse_empreinte = $1 AND NOT consomme", [
      cleAdresse,
    ]);
    await client.query(
      `INSERT INTO codes_connexion (adresse_empreinte, ip_empreinte, code_empreinte, expire_le)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
      [cleAdresse, cleIp, empreinteSecrete, dureeMinutes]
    );
    return true;
  });
}

// Après la réponse : l'admission se lit ici, et le mail ne part qu'à qui
// entrerait. Un échec se journalise sans l'adresse ni le code, et ne remonte
// pas : la réponse est déjà partie, et seule une adresse admise peut échouer.
async function envoyerSiAdmis(adresse: string, code: string, contexte: ContexteEntree): Promise<void> {
  try {
    if (!(await seraitAdmis(adresse, contexte))) return;
    await envoyerMail({
      a: adresse,
      objet: "Votre code de connexion",
      contenu: [
        { paragraphe: "Votre code de connexion :" },
        { code },
        { paragraphe: `Valable ${DUREE_VALIDITE_MINUTES} minutes, pour une seule connexion.` },
        {
          paragraphe:
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : personne ne peut se connecter sans ce code.",
        },
      ],
    });
  } catch (erreur) {
    // Le message des briques mails et comptes ne cite jamais l'adresse, le
    // contenu ni un secret ; on ne journalise rien d'autre.
    console.error(
      "Brique comptes : l'envoi d'un code de connexion a échoué :",
      erreur instanceof Error ? erreur.message : "erreur inconnue"
    );
  }
}

// La connexion de la transaction d'une vérification.
type Client = Parameters<Parameters<typeof transaction>[0]>[0];

/*
 * Lance `verifier` dans une transaction, sauf si l'IP a atteint sa limite de
 * saisies fausses : « limite » alors, sans rien lire. `echec` compte une
 * saisie fausse de l'IP et rend le résultat qu'on lui passe. Partagée avec la
 * connexion par lien (lien-email.ts) : un lien faux compte comme un code faux.
 */
export async function sousLaLimiteDeLIp<R>(
  secret: string,
  ip: string | null,
  verifier: (client: Client, echec: <E>(resultat: E) => Promise<E>) => Promise<R>
): Promise<R | "limite"> {
  const cleIp = empreinteDeLIp(secret, ip);
  const limites = refuserDesLimitesParReseauInvalides(LIMITES_PAR_RESEAU);
  return transaction(async (client) => {
    if (cleIp !== null) {
      // Deux saisies simultanées d'une IP ne passent pas toutes deux sous la limite.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`codes_connexion_essais:ip:${cleIp}`]);
      await client.query("DELETE FROM codes_connexion_essais WHERE cree_le < now() - make_interval(secs => $1)", [
        CONSERVATION_S,
      ]);
      const faux = await client.queryOne<{ n: number }>(
        "SELECT count(*)::int AS n FROM codes_connexion_essais WHERE ip_empreinte = $1",
        [cleIp]
      );
      if ((faux?.n ?? 0) >= limites.codesFauxParHeure) return "limite" as const;
    }
    const echec = async <E>(resultat: E): Promise<E> => {
      if (cleIp !== null) await client.query("INSERT INTO codes_connexion_essais (ip_empreinte) VALUES ($1)", [cleIp]);
      return resultat;
    };
    return verifier(client, echec);
  });
}

/*
 * Vérifie le code saisi contre le DERNIER code demandé pour l'adresse.
 * « expire » couvre aussi le code déjà servi, invalidé ou jamais demandé :
 * dans tous ces cas, il n'y a qu'à en redemander un. Toute saisie fausse compte
 * pour un essai, même celle qui n'a pas la forme d'un code, et pour un essai
 * faux de l'IP ; au-delà de la limite de l'IP, aucun code n'est lu. Dans une
 * appli qui propose aussi le lien, la dernière demande peut être un lien : un
 * code saisi alors ne lui correspond pas, et compte pour un essai faux.
 */
async function verifierLeCode(
  adresse: string,
  saisie: string,
  ip: string | null
): Promise<Exclude<ResultatConnexion, "connecte" | "acces"> | "valide"> {
  const secret = secretDeSession();
  const code = saisie.replace(/\s/g, "");
  return sousLaLimiteDeLIp(secret, ip, async (client, echec) => {
    const ligne = await client.queryOne<{ id: number; code_empreinte: string; essais: number }>(
      `SELECT id, code_empreinte, essais
         FROM codes_connexion
        WHERE adresse_empreinte = $1 AND NOT consomme AND expire_le > now()
        ORDER BY cree_le DESC, id DESC
        LIMIT 1
        FOR UPDATE`,
      [empreinteDeLAdresse(secret, adresse)]
    );
    if (!ligne) return echec("expire" as const);

    const attendue = Buffer.from(ligne.code_empreinte, "hex");
    const recue = Buffer.from(empreinteDuCode(secret, adresse, code), "hex");
    if (/^\d{6}$/.test(code) && timingSafeEqual(attendue, recue)) {
      await client.query("UPDATE codes_connexion SET consomme = true WHERE id = $1", [ligne.id]);
      return "valide";
    }
    const essais = ligne.essais + 1;
    const epuise = essais >= ESSAIS_MAX;
    await client.query("UPDATE codes_connexion SET essais = $2, consomme = $3 WHERE id = $1", [
      ligne.id,
      essais,
      epuise,
    ]);
    return echec(epuise ? ("epuise" as const) : ("incorrect" as const));
  });
}

/*
 * Ouvre la session si le code est le bon et que l'adresse entre encore :
 * « acces » quand le compte a été désactivé ou retiré de la configuration
 * entre l'envoi et la saisie. Seule la personne qui a lu le code peut voir ce
 * refus : une adresse non admise ne reçoit jamais de code. `ip` comme pour
 * demanderUnCode.
 */
export async function connecterParCode(
  email: string,
  code: string,
  ip: string | null,
  contexte = contexteDeLAppli()
): Promise<ResultatConnexion> {
  const adresse = normaliser(email);
  const verification = await verifierLeCode(adresse, code, ip);
  if (verification !== "valide") return verification;
  const compte = await admettre(adresse, contexte);
  if (!compte) return "acces";
  await ouvrirSession(compte);
  return "connecte";
}
