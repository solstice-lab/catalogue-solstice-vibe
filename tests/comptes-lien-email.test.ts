import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookiesDeTest, enTetesDeTest } from "./aide-cookies";
import { supprimerTousLesComptes } from "./aide-comptes";
import { jouer } from "./aide-session";
import { ROLE_PAR_DEFAUT } from "../src/config/acces";
import { query } from "../src/lib/db/client";
import { mailsCaptures, viderMailsCaptures } from "../src/briques/mails/envoi";
import { connecterParLienAction, demanderLienAction } from "../src/briques/comptes/actions";
import { demanderUnCode } from "../src/briques/comptes/code-email";
import { LIMITES_PAR_RESEAU } from "../src/config/comptes";
import { EcranLien } from "../src/briques/comptes/EcranLien";
import type { ContexteEntree } from "../src/briques/comptes/entree";
import { nomDuCookie } from "../src/briques/comptes/jeton";
import {
  adresseDesLiens,
  CHEMIN_LIEN,
  connecterParLien,
  demanderUnLien,
  DUREE_VALIDITE_LIEN_MINUTES,
  etatDuLien,
} from "../src/briques/comptes/lien-email";
import { lireSessionDe } from "../src/briques/comptes/session";

/*
 * La connexion par lien envoyé par e-mail, réservée aux applis grand public.
 * Le piège qu'elle traite d'abord (ticket de la méthode) : en entreprise, les
 * antivirus de messagerie ouvrent chaque lien d'un e-mail avant la personne.
 * Un lien à usage unique consommé à l'ouverture était servi à la machine, et
 * la personne lisait « lien expiré ». Ouvrir le lien (GET) n'affiche donc
 * qu'une page avec un bouton « Me connecter » : c'est son envoi (POST) qui
 * connecte et consomme le lien.
 *
 * Pour le reste, les gardes du code par e-mail : mêmes limites par adresse et
 * par IP (les mêmes lignes en base), même réponse neutre, envoi après la
 * réponse et seulement à une adresse admise. Les mails sont capturés par la
 * brique mails (NODE_ENV=test).
 */

// Les méthodes de l'appli, changées par test : une action se poste sans
// passer par l'écran, et doit refuser une méthode que l'appli ne propose pas.
const reglages = vi.hoisted(() => ({ methodes: ["lien-email"] as string[] }));
vi.mock("../src/config/comptes", async (original) => ({
  ...(await original<typeof import("../src/config/comptes")>()),
  METHODES: reglages.methodes,
}));

const apresReponse = vi.hoisted(() => [] as (() => Promise<unknown> | unknown)[]);
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tache: () => Promise<unknown> | unknown) => {
    apresReponse.push(tache);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const UNE_REDIRECTION = (vers: string) => ({ digest: expect.stringContaining(`;${vers};`) });

const ADMISE = "personne@client.example";
const FERMEE: ContexteEntree = {
  entree: { adresses: { [ADMISE]: ROLE_PAR_DEFAUT }, domaines: [] },
  premierAdmin: undefined,
  demo: false,
};
const OUVERTE: ContexteEntree = { ...FERMEE, entree: { ...FERMEE.entree, ouverte: true } };
const IP_A = "203.0.113.10";
const IP_B = "198.51.100.20";
const ORIGINE = new URL("https://appli.example");

let enAttente: (() => Promise<void>)[] = [];
const planifier = (tache: () => Promise<void>) => {
  enAttente.push(tache);
};
async function lancerLesEnvois(): Promise<void> {
  const taches = enAttente;
  enAttente = [];
  for (const tache of taches) await tache();
}

async function demander(email = ADMISE, ip: string | null = IP_A, contexte = FERMEE, retour = "/") {
  return demanderUnLien(email, ip, ORIGINE, retour, planifier, contexte);
}

// Le lien tel que la personne le lit dans son mail.
function dernierLienRecu(): URL {
  const url = mailsCaptures()
    .at(-1)
    ?.texte.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("aucun lien reçu");
  return new URL(url);
}

async function recevoirUnLien(email = ADMISE, ip: string | null = IP_A, contexte = FERMEE): Promise<string> {
  expect(await demander(email, ip, contexte)).toBe("envoye");
  await lancerLesEnvois();
  const jeton = dernierLienRecu().searchParams.get("jeton");
  if (!jeton) throw new Error("lien sans jeton");
  return jeton;
}

async function vieillir(minutes: number): Promise<void> {
  await query(
    "UPDATE codes_connexion SET cree_le = cree_le - make_interval(mins => $1), expire_le = expire_le - make_interval(mins => $1)",
    [minutes]
  );
}

async function sessionsOuvertes(): Promise<number> {
  return (await query("SELECT 1 FROM sessions")).length;
}

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [nom, valeur] of Object.entries(champs)) donnees.set(nom, valeur);
  return donnees;
}

// Une lettre changée au milieu du jeton : il ne se déchiffre plus.
function retouche(jeton: string): string {
  const milieu = Math.floor(jeton.length / 2);
  return jeton.slice(0, milieu) + (jeton[milieu] === "A" ? "B" : "A") + jeton.slice(milieu + 1);
}

beforeEach(async () => {
  await query("DELETE FROM codes_connexion");
  await query("DELETE FROM codes_connexion_essais");
  await supprimerTousLesComptes();
  viderMailsCaptures();
  cookiesDeTest.clear();
  enAttente = [];
  apresReponse.length = 0;
  reglages.methodes.splice(0, reglages.methodes.length, "lien-email");
  // Personne n'est connecté : on ouvre le lien pour se connecter.
  jouer(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ouvrir le lien ne connecte pas : les antivirus de messagerie l'ouvrent avant la personne (ticket de la méthode)", () => {
  it("ouvrir le lien (GET) ne connecte pas et ne consomme pas le lien : la personne qui l'ouvre après l'antivirus se connecte encore", async () => {
    const jeton = await recevoirUnLien();
    // L'antivirus, puis la personne : deux ouvertures de la page.
    await EcranLien({ jeton, retour: "/" });
    await EcranLien({ jeton, retour: "/" });
    expect(await sessionsOuvertes()).toBe(0);
    expect(cookiesDeTest.get(nomDuCookie())).toBeUndefined();
    expect(await query("SELECT 1 FROM codes_connexion WHERE consomme")).toEqual([]);
    expect(await etatDuLien(jeton)).toBe("valide");
    expect(await connecterParLien(jeton, IP_A, FERMEE)).toBe("connecte");
  });

  it("n'a pas de route GET sous /connexion/lien : seule une page s'y ouvre, et une page ne connecte pas (verrou)", () => {
    const dossier = path.join(process.cwd(), "src", "app", "connexion", "lien");
    expect(fs.readdirSync(dossier)).toContain("page.tsx");
    expect(fs.readdirSync(dossier, { recursive: true }).map(String)).not.toContainEqual(
      expect.stringMatching(/route\.(ts|tsx|js)$/)
    );
  });

  it("ne crée aucun compte à l'ouverture du lien : le compte naît à l'envoi du bouton", async () => {
    const jeton = await recevoirUnLien(ADMISE, IP_A, OUVERTE);
    await EcranLien({ jeton, retour: "/" });
    expect(await query("SELECT 1 FROM utilisateurs")).toEqual([]);
  });

  it("montre la même page, qui propose un nouveau lien, pour un lien expiré, déjà servi ou inventé : elle ne dit rien de l'adresse", async () => {
    const page = async (jeton: string) => JSON.stringify(await EcranLien({ jeton, retour: "/" }));
    const servi = await recevoirUnLien();
    const confirmation = await page(servi);
    expect(confirmation).toContain("Me connecter");
    expect(await connecterParLien(servi, IP_A, FERMEE)).toBe("connecte");
    cookiesDeTest.clear();
    await vieillir(2);
    const expire = await recevoirUnLien();
    await vieillir(DUREE_VALIDITE_LIEN_MINUTES + 1);
    const pages = [await page(servi), await page(expire), await page("inventé")];
    expect(new Set(pages).size).toBe(1);
    expect(pages[0]).not.toContain("Me connecter");
    expect(pages[0]).not.toContain(ADMISE);
    expect(pages[0]).toContain("Demandez-en un nouveau");
  });
});

describe("le bouton « Me connecter » (POST) connecte une fois", { timeout: 30_000 }, () => {
  it("connecte avec le lien reçu, une seule fois : le même lien ne rouvre rien", async () => {
    const jeton = await recevoirUnLien();
    expect(await connecterParLien(jeton, IP_A, FERMEE)).toBe("connecte");
    expect(await lireSessionDe(cookiesDeTest.get(nomDuCookie()), FERMEE)).toEqual({
      email: ADMISE,
      role: ROLE_PAR_DEFAUT,
    });
    cookiesDeTest.clear();
    expect(await connecterParLien(jeton, IP_A, FERMEE)).toBe("expire");
    expect(cookiesDeTest.get(nomDuCookie())).toBeUndefined();
    expect(await sessionsOuvertes()).toBe(1);
    expect(await etatDuLien(jeton)).toBe("expire");
  });

  it(`refuse un lien de plus de ${DUREE_VALIDITE_LIEN_MINUTES} minutes, à l'ouverture comme à l'envoi`, async () => {
    const jeton = await recevoirUnLien();
    await vieillir(DUREE_VALIDITE_LIEN_MINUTES - 1);
    expect(await etatDuLien(jeton)).toBe("valide");
    await vieillir(2);
    expect(await etatDuLien(jeton)).toBe("expire");
    expect(await connecterParLien(jeton, IP_A, FERMEE)).toBe("expire");
    expect(await sessionsOuvertes()).toBe(0);
  });

  it("invalide l'ancien lien quand un nouveau est demandé : seul le dernier reçu vaut", async () => {
    const ancien = await recevoirUnLien();
    await vieillir(2);
    const nouveau = await recevoirUnLien();
    expect(await etatDuLien(ancien)).toBe("expire");
    expect(await connecterParLien(ancien, IP_A, FERMEE)).toBe("expire");
    expect(await connecterParLien(nouveau, IP_A, FERMEE)).toBe("connecte");
  });

  it("refuse un jeton retouché, inventé ou vide, sans rien connecter", async () => {
    const jeton = await recevoirUnLien();
    for (const faux of [retouche(jeton), "inventé", "", "x".repeat(5000)]) {
      expect(await etatDuLien(faux)).toBe("expire");
      expect(await connecterParLien(faux, IP_A, FERMEE)).toBe("expire");
    }
    expect(await sessionsOuvertes()).toBe(0);
    // Le vrai lien n'a pas été touché.
    expect(await connecterParLien(jeton, IP_A, FERMEE)).toBe("connecte");
  });

  it(`n'examine plus aucun lien depuis une IP après ${LIMITES_PAR_RESEAU.codesFauxParHeure} envois faux dans l'heure, comme pour le code`, async () => {
    const jeton = await recevoirUnLien();
    for (let i = 0; i < LIMITES_PAR_RESEAU.codesFauxParHeure; i++) {
      expect(await connecterParLien(`faux-${i}`, IP_B, FERMEE)).toBe("expire");
    }
    expect(await connecterParLien(jeton, IP_B, FERMEE)).toBe("limite");
    expect(await connecterParLien(jeton, IP_A, FERMEE)).toBe("connecte");
  });

  it("refuse une adresse désactivée entre l'envoi du lien et le bouton", async () => {
    await connecterParLien(await recevoirUnLien(), IP_A, FERMEE);
    cookiesDeTest.clear();
    await query("DELETE FROM sessions");
    await vieillir(2);
    const jeton = await recevoirUnLien();
    await query("UPDATE utilisateurs SET actif = false");
    expect(await connecterParLien(jeton, IP_A, FERMEE)).toBe("acces");
    expect(await sessionsOuvertes()).toBe(0);
  });
});

describe("qui reçoit un lien : la réponse ne dit pas qui a un compte", { timeout: 30_000 }, () => {
  it("répond avant l'envoi, la même chose pour une adresse admise ou inconnue, et n'envoie qu'à l'adresse admise", async () => {
    expect(await demander(ADMISE)).toBe("envoye");
    expect(await demander("inconnue@client.example")).toBe("envoye");
    expect(mailsCaptures()).toEqual([]);
    expect(await query("SELECT 1 FROM codes_connexion")).toHaveLength(2);
    await lancerLesEnvois();
    expect(mailsCaptures().map((mail) => mail.a)).toEqual([ADMISE]);
  });

  it("refuse, dans une appli à entrée fermée, une adresse hors de la liste : aucun lien ne part, et un lien obtenu autrement ne connecte pas", async () => {
    const horsListe = "hors-liste@ailleurs.example";
    expect(await demander(horsListe, IP_A, FERMEE)).toBe("envoye");
    await lancerLesEnvois();
    expect(mailsCaptures()).toEqual([]);
    // Un lien reçu quand l'appli était ouverte, utilisé une fois fermée.
    await vieillir(2);
    const jeton = await recevoirUnLien(horsListe, IP_A, OUVERTE);
    expect(await connecterParLien(jeton, IP_A, FERMEE)).toBe("acces");
    expect(await sessionsOuvertes()).toBe(0);
    expect(await query("SELECT 1 FROM utilisateurs")).toEqual([]);
  });

  it("accepte, dans une appli à entrée ouverte, une adresse inconnue, avec le rôle par défaut", async () => {
    const inconnue = "nouvelle@ailleurs.example";
    const jeton = await recevoirUnLien(inconnue, IP_A, OUVERTE);
    expect(await connecterParLien(jeton, IP_A, OUVERTE)).toBe("connecte");
    expect(await lireSessionDe(cookiesDeTest.get(nomDuCookie()), OUVERTE)).toEqual({
      email: inconnue,
      role: ROLE_PAR_DEFAUT,
    });
  });

  it("partage les limites du code par e-mail : un lien puis un code dans la minute, pour la même adresse, est refusé", async () => {
    expect(await demander()).toBe("envoye");
    expect(await demanderUnCode(ADMISE, IP_A, planifier, FERMEE)).toBe("limite");
    expect(await demander()).toBe("limite");
  });

  it(`refuse la ${LIMITES_PAR_RESEAU.demandesParHeure + 1}e demande de l'heure depuis une même IP, toutes adresses confondues`, async () => {
    for (let i = 0; i < LIMITES_PAR_RESEAU.demandesParHeure; i++)
      expect(await demander(`personne${i}@client.example`)).toBe("envoye");
    expect(await demander("encore-une@client.example")).toBe("limite");
    expect(await demander("encore-une@client.example", IP_B)).toBe("envoye");
  });

  // Audit du 2026-11-09 : rien ne plafonnait les mails de connexion de toute
  // l'appli. Le lien le partage avec le code, sans quoi une appli qui propose
  // les deux méthodes doublerait ce qu'elle fait partir dans l'heure.
  it("partage le plafond de toute l'appli avec le code : au plafond, la réponse ordinaire, sans lien envoyé", async () => {
    const limites = LIMITES_PAR_RESEAU as { envoisParHeure?: number };
    limites.envoisParHeure = 2;
    try {
      expect(await demanderUnCode("autre@client.example", IP_B, planifier, OUVERTE)).toBe("envoye");
      expect(await demander(ADMISE, IP_A)).toBe("envoye");
      await lancerLesEnvois();
      expect(mailsCaptures()).toHaveLength(2);
      viderMailsCaptures();
      expect(await demander("nouvelle@client.example", "192.0.2.1", OUVERTE)).toBe("envoye");
      await lancerLesEnvois();
      expect(mailsCaptures()).toEqual([]);
    } finally {
      delete limites.envoisParHeure;
    }
  });

  it("ne met l'adresse en clair ni dans le lien ni en base, ni le jeton en base", async () => {
    const jeton = await recevoirUnLien();
    const lien = dernierLienRecu().href;
    expect(decodeURIComponent(lien)).not.toContain(ADMISE);
    expect(Buffer.from(jeton, "base64url").toString("latin1")).not.toContain(ADMISE);
    const lignes = JSON.stringify(await query("SELECT * FROM codes_connexion"));
    expect(lignes).not.toContain(ADMISE);
    expect(lignes).not.toContain(jeton);
    expect(lignes).not.toContain(IP_A);
  });

  it("met dans le mail un lien vers la page de confirmation, sa durée, et quoi faire sans l'avoir demandé", async () => {
    await recevoirUnLien();
    const [mail] = mailsCaptures();
    expect(mail.objet).toMatch(/lien de connexion/i);
    expect(dernierLienRecu().origin).toBe(ORIGINE.origin);
    expect(dernierLienRecu().pathname).toBe(CHEMIN_LIEN);
    expect(mail.texte).toContain(`${DUREE_VALIDITE_LIEN_MINUTES} minutes`);
    expect(mail.texte).toMatch(/ignorez ce message/);
  });

  it("garde dans le lien le chemin où revenir, filtré", async () => {
    expect(await demander(ADMISE, IP_A, FERMEE, "/page?vue=liste")).toBe("envoye");
    await lancerLesEnvois();
    expect(dernierLienRecu().searchParams.get("retour")).toBe("/page?vue=liste");
    await vieillir(2);
    expect(await demander(ADMISE, IP_A, FERMEE, "//ailleurs.example")).toBe("envoye");
    await lancerLesEnvois();
    expect(dernierLienRecu().searchParams.get("retour")).toBeNull();
  });
});

describe("l'adresse du lien : jamais celle que la requête prétend", () => {
  it("en production, prend URL_PUBLIQUE et ignore l'en-tête Host : sinon, un tiers ferait envoyer à une personne un lien vers son propre site, et y recueillerait le jeton", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("URL_PUBLIQUE", "https://appli.example");
    const enTetes = new Headers({ host: "piege.example" });
    expect(adresseDesLiens(enTetes)?.origin).toBe("https://appli.example");
  });

  it("en production, sans URL_PUBLIQUE valable (absente, en http, avec un chemin), n'en donne aucune", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const valeur of ["", "http://appli.example", "https://appli.example/chemin", "pas une adresse"]) {
      vi.stubEnv("URL_PUBLIQUE", valeur);
      expect(adresseDesLiens(new Headers({ host: "appli.example" })), valeur).toBeNull();
    }
  });

  it("en local, prend l'hôte de la requête : le lien du mail affiché dans la console s'ouvre sur le poste", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("URL_PUBLIQUE", "");
    expect(adresseDesLiens(new Headers({ host: "localhost:3000" }))?.origin).toBe("http://localhost:3000");
  });
});

describe("les actions de /connexion et de /connexion/lien", { timeout: 30_000 }, () => {
  beforeEach(() => {
    // La configuration du catalogue n'admet personne : le premier admin entre.
    vi.stubEnv("COMPTES_PREMIER_ADMIN", ADMISE);
    enTetesDeTest.set("host", "localhost:3000");
  });
  afterEach(() => {
    enTetesDeTest.delete("host");
  });

  async function lienParLAction(retour = "/"): Promise<string> {
    const etat = await demanderLienAction({}, formulaire({ email: ADMISE, retour }));
    expect(etat).toMatchObject({ email: ADMISE });
    for (const tache of apresReponse.splice(0)) await tache();
    const jeton = dernierLienRecu().searchParams.get("jeton");
    if (!jeton) throw new Error("lien sans jeton");
    return jeton;
  }

  it("refuse les deux actions quand la méthode n'est pas proposée : une action se poste sans passer par l'écran", async () => {
    reglages.methodes.splice(0, reglages.methodes.length, "code-email");
    expect((await demanderLienAction({}, formulaire({ email: ADMISE }))).erreur).toBeTruthy();
    expect(await query("SELECT 1 FROM codes_connexion")).toEqual([]);
    await expect(connecterParLienAction(formulaire({ jeton: "x" }))).rejects.toMatchObject(
      UNE_REDIRECTION("/connexion")
    );
  });

  it("donne le même état à une adresse inconnue qu'à une adresse admise, et refuse une adresse mal formée", async () => {
    const admise = await demanderLienAction({}, formulaire({ email: ADMISE }));
    const inconnue = await demanderLienAction({}, formulaire({ email: "inconnue@client.example" }));
    expect(Object.keys(inconnue).sort()).toEqual(Object.keys(admise).sort());
    expect(inconnue.erreur).toBeUndefined();
    expect((await demanderLienAction({}, formulaire({ email: "pas-une-adresse" }))).erreur).toBeTruthy();
  });

  it("dit la limite atteinte en gardant l'étape « lien envoyé »", async () => {
    const etat = await demanderLienAction({}, formulaire({ email: ADMISE }));
    const encore = await demanderLienAction(etat, formulaire({ email: ADMISE }));
    expect(encore.email).toBe(ADMISE);
    expect(encore.erreur).toMatch(/Trop de demandes/);
  });

  it("connecte et renvoie au chemin du lien, refiltré, puis renvoie le même lien vers la page qui en propose un nouveau", async () => {
    const jeton = await lienParLAction("/page");
    await expect(connecterParLienAction(formulaire({ jeton, retour: "/page" }))).rejects.toMatchObject(
      UNE_REDIRECTION("/page")
    );
    expect(await sessionsOuvertes()).toBe(1);
    cookiesDeTest.clear();
    await expect(connecterParLienAction(formulaire({ jeton, retour: "//ailleurs.example" }))).rejects.toMatchObject(
      UNE_REDIRECTION(`${CHEMIN_LIEN}?erreur=expire`)
    );
    expect(await sessionsOuvertes()).toBe(1);
  });

  it("refiltre le retour posté : le champ caché se réécrit dans le navigateur", async () => {
    const jeton = await lienParLAction();
    await expect(connecterParLienAction(formulaire({ jeton, retour: "//ailleurs.example" }))).rejects.toMatchObject(
      UNE_REDIRECTION("/")
    );
  });

  it("refuse d'envoyer un lien en production sans URL_PUBLIQUE, sans rien écrire", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("URL_PUBLIQUE", "");
    expect((await demanderLienAction({}, formulaire({ email: ADMISE }))).erreur).toMatch(/URL_PUBLIQUE/);
    expect(await query("SELECT 1 FROM codes_connexion")).toEqual([]);
  });
});
