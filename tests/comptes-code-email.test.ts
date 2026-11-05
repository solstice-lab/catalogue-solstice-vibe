import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookiesDeTest, enTetesDeTest } from "./aide-cookies";
import { supprimerTousLesComptes } from "./aide-comptes";
import { ROLE_PAR_DEFAUT } from "../src/config/acces";
import { query } from "../src/lib/db/client";
import { mailsCaptures, viderMailsCaptures } from "../src/briques/mails/envoi";
import { demanderCodeAction, verifierCodeAction } from "../src/briques/comptes/actions";
import {
  connecterParCode,
  demanderUnCode,
  DEMANDES_PAR_HEURE_ADRESSE,
  DEMANDES_PAR_HEURE_ADRESSE_IP,
  ESSAIS_MAX,
} from "../src/briques/comptes/code-email";
import type { ContexteEntree } from "../src/briques/comptes/entree";
import { nomDuCookie } from "../src/briques/comptes/jeton";
import { lireSessionDe } from "../src/briques/comptes/session";
import { refuserDesLimitesParReseauInvalides } from "../src/briques/comptes/methodes";

/*
 * La connexion par code à 6 chiffres envoyé par e-mail, reprise
 * d'un projet précédent avec ses corrections. Chaque piège payé là-bas a son
 * test : la réponse n'attend pas l'envoi, elle est la même que l'adresse soit
 * admise ou non, les limites se comptent par adresse ET par adresse IP, en
 * base, et le code est à usage unique, expire, et ne supporte que trois
 * essais faux. Les mails sont capturés par la brique mails (NODE_ENV=test).
 */

// Les limites par réseau de l'appli (src/config/comptes.ts), changées par test :
// la brique doit lire le réglage de l'appli, pas une valeur à elle.
const reglages = vi.hoisted(() => ({ limites: { demandesParHeure: 20, codesFauxParHeure: 30 } }));
vi.mock("../src/config/comptes", async (original) => ({
  ...(await original<typeof import("../src/config/comptes")>()),
  LIMITES_PAR_RESEAU: reglages.limites,
}));
const DEMANDES_PAR_HEURE_IP = reglages.limites.demandesParHeure;
const ESSAIS_FAUX_PAR_HEURE_IP = reglages.limites.codesFauxParHeure;

// L'envoi peut être mis en panne par un test, le reste de la brique mails
// reste le vrai (capture en test).
const envoi = vi.hoisted(() => ({ enPanne: false }));
vi.mock("../src/briques/mails/envoi", async (original) => {
  const vrai = await original<typeof import("../src/briques/mails/envoi")>();
  return {
    ...vrai,
    envoyerMail: async (mail: Parameters<typeof vrai.envoyerMail>[0]) => {
      if (envoi.enPanne) throw new Error("fournisseur en panne");
      return vrai.envoyerMail(mail);
    },
  };
});

// after() de Next lance la tâche une fois la réponse partie : ici, les tâches
// s'empilent et le test les lance quand il le décide.
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
const CONTEXTE: ContexteEntree = {
  entree: { adresses: { [ADMISE]: ROLE_PAR_DEFAUT }, domaines: [] },
  premierAdmin: undefined,
  demo: false,
};
const IP_A = "203.0.113.10";
const IP_B = "198.51.100.20";

// Les tâches d'après-réponse d'une demande, gardées pour être lancées plus tard.
let enAttente: (() => Promise<void>)[] = [];
const planifier = (tache: () => Promise<void>) => {
  enAttente.push(tache);
};
async function lancerLesEnvois(): Promise<void> {
  const taches = enAttente;
  enAttente = [];
  for (const tache of taches) await tache();
}

async function demander(email = ADMISE, ip: string | null = IP_A) {
  return demanderUnCode(email, ip, planifier, CONTEXTE);
}

// Le code tel que la personne le lit dans son mail.
function dernierCodeRecu(): string {
  const mails = mailsCaptures();
  const code = mails.at(-1)?.texte.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error("aucun code reçu");
  return code;
}

async function recevoirUnCode(email = ADMISE, ip: string | null = IP_A): Promise<string> {
  expect(await demander(email, ip)).toBe("envoye");
  await lancerLesEnvois();
  return dernierCodeRecu();
}

function autreCode(code: string): string {
  return String((Number(code) + 1) % 1_000_000).padStart(6, "0");
}

// Le temps passe en base : les limites et l'expiration se lisent sur now().
async function vieillir(minutes: number): Promise<void> {
  await query(
    "UPDATE codes_connexion SET cree_le = cree_le - make_interval(mins => $1), expire_le = expire_le - make_interval(mins => $1)",
    [minutes]
  );
}

async function sessionsOuvertes(): Promise<number> {
  return (await query("SELECT 1 FROM sessions")).length;
}

beforeEach(async () => {
  await query("DELETE FROM codes_connexion");
  await query("DELETE FROM codes_connexion_essais");
  await supprimerTousLesComptes();
  viderMailsCaptures();
  enAttente = [];
  apresReponse.length = 0;
  envoi.enPanne = false;
  reglages.limites.demandesParHeure = DEMANDES_PAR_HEURE_IP;
  reglages.limites.codesFauxParHeure = ESSAIS_FAUX_PAR_HEURE_IP;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Essai réel de la brique déploiement : un téléphone en Wi-Fi refusé à sa première
// demande, un poste du même réseau ayant épuisé les 20 demandes par IP. La valeur
// dépend de l'appli (un bureau de 50 personnes, une appli grand public) : elle se
// règle dans src/config/comptes.ts, et la brique la lit.
describe("limites par réseau : lues du réglage de l'appli, jamais retirées", { timeout: 30_000 }, () => {
  it("lit les demandes par heure et par IP du réglage de l'appli : à 3, la 4e demande d'un réseau est refusée, et à 30 la 21e passe", async () => {
    reglages.limites.demandesParHeure = 3;
    for (let i = 0; i < 3; i++) expect(await demander(`reseau${i}@client.example`)).toBe("envoye");
    expect(await demander("reseau3@client.example")).toBe("limite");
    expect(await demander("reseau3@client.example", IP_B)).toBe("envoye");

    await query("DELETE FROM codes_connexion");
    reglages.limites.demandesParHeure = 30;
    for (let i = 0; i < 21; i++) expect(await demander(`reseau${i}@client.example`)).toBe("envoye");
  });

  it("lit les saisies fausses par heure et par IP du réglage de l'appli : à 2, la 3e saisie d'une IP n'examine plus aucun code", async () => {
    reglages.limites.codesFauxParHeure = 2;
    const code = await recevoirUnCode();
    for (let i = 0; i < 2; i++) {
      expect(await connecterParCode(`sonde${i}@client.example`, "000000", IP_B, CONTEXTE)).not.toBe("limite");
    }
    expect(await connecterParCode(ADMISE, code, IP_B, CONTEXTE)).toBe("limite");
    expect(await connecterParCode(ADMISE, code, IP_A, CONTEXTE)).toBe("connecte");
  });

  it("garde fixes les limites par adresse e-mail, quel que soit le réglage du réseau : elles parlent d'une seule personne", async () => {
    reglages.limites.demandesParHeure = 1_000;
    for (let i = 0; i < DEMANDES_PAR_HEURE_ADRESSE; i++) {
      expect(await demander(ADMISE, `192.0.2.${i}`)).toBe("envoye");
    }
    expect(await demander(ADMISE, "192.0.2.200")).toBe("limite");
  });

  it("refuse une limite nulle, négative, non entière ou sans plafond, avant toute écriture : une limite par réseau se règle, elle ne se retire pas", async () => {
    for (const refusee of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      reglages.limites.demandesParHeure = refusee;
      await expect(demander(), String(refusee)).rejects.toThrow(/Brique comptes : .*demandesParHeure/);
      reglages.limites.demandesParHeure = DEMANDES_PAR_HEURE_IP;
      reglages.limites.codesFauxParHeure = refusee;
      await expect(connecterParCode(ADMISE, "123456", IP_A, CONTEXTE), String(refusee)).rejects.toThrow(
        /Brique comptes : .*codesFauxParHeure/
      );
      reglages.limites.codesFauxParHeure = ESSAIS_FAUX_PAR_HEURE_IP;
    }
    expect(await query("SELECT 1 FROM codes_connexion")).toHaveLength(0);
    expect(await query("SELECT 1 FROM codes_connexion_essais")).toHaveLength(0);
  });

  it("refuse la limite invalide au démarrage, comme les autres gardes de la brique, et nomme le réglage fautif", () => {
    expect(() => refuserDesLimitesParReseauInvalides()).not.toThrow();
    expect(() => refuserDesLimitesParReseauInvalides({ demandesParHeure: 0, codesFauxParHeure: 30 })).toThrow(
      /demandesParHeure.*LIMITES_PAR_RESEAU/
    );
    expect(() => refuserDesLimitesParReseauInvalides({ demandesParHeure: 20, codesFauxParHeure: -5 })).toThrow(
      /codesFauxParHeure/
    );
    // Une clé absente ferait d'une comparaison une limite qui ne refuse jamais.
    expect(() => refuserDesLimitesParReseauInvalides({ demandesParHeure: 20 } as never)).toThrow(/codesFauxParHeure/);
    expect(() => refuserDesLimitesParReseauInvalides({ codesFauxParHeure: 30 } as never)).toThrow(/demandesParHeure/);
    expect(refuserDesLimitesParReseauInvalides({ demandesParHeure: 100, codesFauxParHeure: 150 })).toEqual({
      demandesParHeure: 100,
      codesFauxParHeure: 150,
    });
  });
});

describe("demande d'un code : la réponse ne dit pas qui a un compte", () => {
  it("répond avant l'envoi, qui part après la réponse : attendre l'envoi rendait la réponse plus lente pour une adresse connue (projet précédent)", async () => {
    expect(await demander()).toBe("envoye");
    expect(mailsCaptures()).toEqual([]);
    expect(enAttente).toHaveLength(1);
    await lancerLesEnvois();
    expect(mailsCaptures().map((mail) => mail.a)).toEqual([ADMISE]);
  });

  it("ne lit l'admission qu'après la réponse : une adresse désactivée entre-temps ne reçoit rien", async () => {
    await connecterParCode(ADMISE, await recevoirUnCode(), IP_A, CONTEXTE);
    await vieillir(2);
    viderMailsCaptures();
    expect(await demander()).toBe("envoye");
    await query("UPDATE utilisateurs SET actif = false");
    await lancerLesEnvois();
    expect(mailsCaptures()).toEqual([]);
  });

  it("répond la même chose pour une adresse admise, inconnue, désactivée ou d'un domaine non listé, et n'envoie qu'à l'adresse admise", async () => {
    await query("INSERT INTO utilisateurs (email, role, actif) VALUES ('desactivee@client.example', $1, false)", [
      ROLE_PAR_DEFAUT,
    ]);
    const adresses = [ADMISE, "inconnue@client.example", "desactivee@client.example", "x@ailleurs.example"];
    const reponses = [];
    for (const adresse of adresses) reponses.push(await demander(adresse));
    expect(new Set(reponses)).toEqual(new Set(["envoye"]));
    // Le même travail en base pour chacune : une ligne par demande.
    expect(await query("SELECT 1 FROM codes_connexion")).toHaveLength(adresses.length);
    await lancerLesEnvois();
    expect(mailsCaptures().map((mail) => mail.a)).toEqual([ADMISE]);
  });

  it("ne crée aucun compte à la demande d'un code : le compte naît à la vérification", async () => {
    await recevoirUnCode();
    expect(await query("SELECT 1 FROM utilisateurs")).toEqual([]);
  });

  it("tait un envoi en échec : même réponse, et le journal ne cite ni l'adresse ni le code", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    envoi.enPanne = true;
    expect(await demander()).toBe("envoye");
    await expect(lancerLesEnvois()).resolves.toBeUndefined();
    expect(journal).toHaveBeenCalledTimes(1);
    const ecrit = JSON.stringify(journal.mock.calls);
    expect(ecrit).not.toContain(ADMISE);
    expect(ecrit).not.toMatch(/\b\d{6}\b/);
  });

  it("met dans le mail le code, sa durée de validité et quoi faire sans l'avoir demandé", async () => {
    await recevoirUnCode();
    const [mail] = mailsCaptures();
    expect(mail.objet).toMatch(/code de connexion/i);
    expect(mail.texte).toMatch(/10 minutes/);
    expect(mail.texte).toMatch(/ignorez ce message/);
  });
});

// Des dizaines de demandes par test, chacune une transaction sous verrou.
describe("limites de demandes, en base, par adresse et par adresse IP", { timeout: 30_000 }, () => {
  it("refuse une deuxième demande dans la minute pour la même adresse depuis la même IP", async () => {
    expect(await demander()).toBe("envoye");
    expect(await demander()).toBe("limite");
  });

  it(`refuse la ${DEMANDES_PAR_HEURE_ADRESSE_IP + 1}e demande de l'heure pour une adresse depuis une IP, et accepte de nouveau une heure après`, async () => {
    for (let i = 0; i < DEMANDES_PAR_HEURE_ADRESSE_IP; i++) {
      expect(await demander()).toBe("envoye");
      await vieillir(2);
    }
    expect(await demander()).toBe("limite");
    await vieillir(60);
    expect(await demander()).toBe("envoye");
  });

  it("ne laisse pas un tiers tenir une personne dehors : le quota d'une adresse épuisé depuis une IP ne la bloque pas depuis la sienne (projet précédent)", async () => {
    for (let i = 0; i < DEMANDES_PAR_HEURE_ADRESSE_IP; i++) {
      await demander(ADMISE, IP_B);
      await vieillir(2);
    }
    expect(await demander(ADMISE, IP_B)).toBe("limite");
    expect(await demander(ADMISE, IP_A)).toBe("envoye");
  });

  it(`refuse la ${DEMANDES_PAR_HEURE_IP + 1}e demande de l'heure depuis une même IP, toutes adresses confondues : qui essaie des milliers d'adresses est borné`, async () => {
    for (let i = 0; i < DEMANDES_PAR_HEURE_IP; i++)
      expect(await demander(`personne${i}@client.example`)).toBe("envoye");
    expect(await demander("encore-une@client.example")).toBe("limite");
    expect(await demander("encore-une@client.example", IP_B)).toBe("envoye");
  });

  it(`refuse la ${DEMANDES_PAR_HEURE_ADRESSE + 1}e demande de l'heure pour une adresse, toutes IP confondues : beaucoup d'IP ne donnent pas un nombre d'essais sans fin`, async () => {
    for (let i = 0; i < DEMANDES_PAR_HEURE_ADRESSE; i++) expect(await demander(ADMISE, `192.0.2.${i}`)).toBe("envoye");
    expect(await demander(ADMISE, "192.0.2.200")).toBe("limite");
  });

  it("applique les mêmes limites à une adresse inconnue : la limite ne trahit pas qui a un compte", async () => {
    expect(await demander("inconnue@client.example")).toBe("envoye");
    expect(await demander("inconnue@client.example")).toBe("limite");
  });

  it("ne laisse passer qu'une demande parmi plusieurs simultanées : les limites se lisent sous verrou", async () => {
    const reponses = await Promise.all([demander(), demander(), demander(), demander()]);
    expect(reponses.filter((reponse) => reponse === "envoye")).toHaveLength(1);
  });

  it("ne laisse passer qu'une demande parmi plusieurs simultanées d'une IP, pour des adresses différentes, à une place de sa limite : la limite par IP se lit sous verrou", async () => {
    for (let i = 1; i < DEMANDES_PAR_HEURE_IP; i++) await demander(`avant${i}@client.example`);
    const reponses = await Promise.all(Array.from({ length: 5 }, (_, i) => demander(`simultanee${i}@client.example`)));
    expect(reponses.filter((reponse) => reponse === "envoye")).toHaveLength(1);
  });

  it("sans adresse IP lisible en production, garde les limites par adresse et laisse tomber celle par IP, qui bloquerait tout le monde d'un coup", async () => {
    for (let i = 0; i <= DEMANDES_PAR_HEURE_IP; i++)
      expect(await demander(`personne${i}@client.example`, null)).toBe("envoye");
    expect(await demander("personne0@client.example", null)).toBe("limite");
  });

  it("ne garde en base ni le code, ni l'adresse, ni l'IP : seulement leurs empreintes", async () => {
    const code = await recevoirUnCode();
    const lignes = JSON.stringify(await query("SELECT * FROM codes_connexion"));
    expect(lignes).not.toContain(code);
    expect(lignes).not.toContain(ADMISE);
    expect(lignes).not.toContain(IP_A);
  });

  it("efface les demandes de plus d'une heure à la demande suivante", async () => {
    await recevoirUnCode();
    await vieillir(61);
    await demander("autre@client.example");
    expect(await query("SELECT 1 FROM codes_connexion")).toHaveLength(1);
  });
});

describe("vérification du code : expiré, déjà utilisé ou faux ne connecte pas", { timeout: 30_000 }, () => {
  it("connecte avec le bon code, une seule fois : le même code ne rouvre rien", async () => {
    const code = await recevoirUnCode();
    expect(await connecterParCode(ADMISE, code, IP_A, CONTEXTE)).toBe("connecte");
    const cookie = cookiesDeTest.get(nomDuCookie());
    expect(await lireSessionDe(cookie, CONTEXTE)).toEqual({ email: ADMISE, role: ROLE_PAR_DEFAUT });
    cookiesDeTest.clear();
    expect(await connecterParCode(ADMISE, code, IP_A, CONTEXTE)).toBe("expire");
    expect(cookiesDeTest.get(nomDuCookie())).toBeUndefined();
    expect(await sessionsOuvertes()).toBe(1);
  });

  it("refuse un code de plus de 10 minutes", async () => {
    const code = await recevoirUnCode();
    await vieillir(11);
    expect(await connecterParCode(ADMISE, code, IP_A, CONTEXTE)).toBe("expire");
    expect(await sessionsOuvertes()).toBe(0);
  });

  it(`refuse un code faux, et invalide le code au ${ESSAIS_MAX}e essai faux, même si le bon arrive ensuite`, async () => {
    const code = await recevoirUnCode();
    for (let essai = 1; essai < ESSAIS_MAX; essai++)
      expect(await connecterParCode(ADMISE, autreCode(code), IP_A, CONTEXTE)).toBe("incorrect");
    expect(await connecterParCode(ADMISE, autreCode(code), IP_A, CONTEXTE)).toBe("epuise");
    expect(await connecterParCode(ADMISE, code, IP_A, CONTEXTE)).toBe("expire");
    expect(await sessionsOuvertes()).toBe(0);
    expect(cookiesDeTest.get(nomDuCookie())).toBeUndefined();
  });

  it("invalide l'ancien code quand un nouveau est demandé", async () => {
    const ancien = await recevoirUnCode();
    await vieillir(2);
    const nouveau = await recevoirUnCode();
    if (ancien !== nouveau) expect(await connecterParCode(ADMISE, ancien, IP_A, CONTEXTE)).toBe("incorrect");
    expect(await connecterParCode(ADMISE, nouveau, IP_A, CONTEXTE)).toBe("connecte");
  });

  it("ne vaut que pour l'adresse qui l'a demandé", async () => {
    const code = await recevoirUnCode();
    expect(await connecterParCode("autre@client.example", code, IP_A, CONTEXTE)).toBe("expire");
    expect(await sessionsOuvertes()).toBe(0);
  });

  it("tolère la casse de l'adresse et les espaces d'un code collé", async () => {
    const code = await recevoirUnCode();
    expect(
      await connecterParCode(" PERSONNE@Client.example ", ` ${code.slice(0, 3)} ${code.slice(3)} `, IP_A, CONTEXTE)
    ).toBe("connecte");
  });

  it("compte comme un essai faux toute saisie qui n'est pas un code à 6 chiffres : un robot n'essaie pas gratuitement", async () => {
    const code = await recevoirUnCode();
    expect(await connecterParCode(ADMISE, "abcdef", IP_A, CONTEXTE)).toBe("incorrect");
    expect(await connecterParCode(ADMISE, "", IP_A, CONTEXTE)).toBe("incorrect");
    expect(await connecterParCode(ADMISE, "1234567", IP_A, CONTEXTE)).toBe("epuise");
    expect(await connecterParCode(ADMISE, code, IP_A, CONTEXTE)).toBe("expire");
  });

  it(`n'examine plus aucun code depuis une IP après ${ESSAIS_FAUX_PAR_HEURE_IP} saisies fausses dans l'heure : elle ne peut ni invalider ni sonder les codes des autres (relevé en relecture)`, async () => {
    const code = await recevoirUnCode();
    for (let i = 0; i < ESSAIS_FAUX_PAR_HEURE_IP; i++) {
      expect(await connecterParCode(`sonde${i}@client.example`, "000000", IP_B, CONTEXTE)).not.toBe("limite");
    }
    expect(await connecterParCode(ADMISE, autreCode(code), IP_B, CONTEXTE)).toBe("limite");
    expect(await connecterParCode(ADMISE, code, IP_B, CONTEXTE)).toBe("limite");
    // Le code de la personne n'a pas été touché : elle se connecte depuis la sienne.
    expect(await connecterParCode(ADMISE, code, IP_A, CONTEXTE)).toBe("connecte");
  });

  it("efface les saisies fausses de plus d'une heure : l'IP retrouve ses essais", async () => {
    for (let i = 0; i < ESSAIS_FAUX_PAR_HEURE_IP; i++)
      await connecterParCode(`sonde${i}@client.example`, "000000", IP_B, CONTEXTE);
    await query("UPDATE codes_connexion_essais SET cree_le = cree_le - interval '61 minutes'");
    expect(await connecterParCode("sonde@client.example", "000000", IP_B, CONTEXTE)).toBe("expire");
    expect(await query("SELECT 1 FROM codes_connexion_essais")).toHaveLength(1);
  });

  it("sans adresse IP lisible en production, ne compte pas les saisies fausses par IP, qui bloqueraient tout le monde d'un coup", async () => {
    for (let i = 0; i <= ESSAIS_FAUX_PAR_HEURE_IP; i++) {
      expect(await connecterParCode(`sonde${i}@client.example`, "000000", null, CONTEXTE)).toBe("expire");
    }
  });

  it("refuse une adresse désactivée entre l'envoi du code et sa saisie", async () => {
    await connecterParCode(ADMISE, await recevoirUnCode(), IP_A, CONTEXTE);
    cookiesDeTest.clear();
    await query("DELETE FROM sessions");
    await vieillir(2);
    const code = await recevoirUnCode();
    await query("UPDATE utilisateurs SET actif = false");
    expect(await connecterParCode(ADMISE, code, IP_A, CONTEXTE)).toBe("acces");
    expect(await sessionsOuvertes()).toBe(0);
  });
});

describe("les actions de /connexion", { timeout: 30_000 }, () => {
  function formulaire(champs: Record<string, string>): FormData {
    const donnees = new FormData();
    for (const [nom, valeur] of Object.entries(champs)) donnees.set(nom, valeur);
    return donnees;
  }

  beforeEach(() => {
    // La configuration du catalogue n'admet personne : le premier admin entre.
    vi.stubEnv("COMPTES_PREMIER_ADMIN", ADMISE);
  });

  it("répond sans attendre l'envoi, qu'elle confie à after() de Next", async () => {
    const etat = await demanderCodeAction({}, formulaire({ email: ` ${ADMISE.toUpperCase()} ` }));
    expect(etat).toMatchObject({ email: ADMISE });
    expect(etat.erreur).toBeUndefined();
    expect(mailsCaptures()).toEqual([]);
    expect(apresReponse).toHaveLength(1);
    await apresReponse[0]();
    expect(mailsCaptures().map((mail) => mail.a)).toEqual([ADMISE]);
  });

  it("compte les demandes par l'IP que lit adresseDuVisiteur dans les en-têtes de la requête", async () => {
    vi.stubEnv("IP_EN_TETE_CLIENT", "cf-connecting-ip");
    enTetesDeTest.set("cf-connecting-ip", IP_A);
    for (let i = 0; i < DEMANDES_PAR_HEURE_IP; i++) {
      expect(
        (await demanderCodeAction({}, formulaire({ email: `personne${i}@client.example` }))).erreur
      ).toBeUndefined();
    }
    expect((await demanderCodeAction({}, formulaire({ email: "encore-une@client.example" }))).erreur).toMatch(
      /Trop de demandes/
    );
    enTetesDeTest.set("cf-connecting-ip", IP_B);
    expect((await demanderCodeAction({}, formulaire({ email: "encore-une@client.example" }))).erreur).toBeUndefined();
  });

  it("donne le même état à une adresse inconnue qu'à une adresse admise", async () => {
    const admise = await demanderCodeAction({}, formulaire({ email: ADMISE }));
    const inconnue = await demanderCodeAction({}, formulaire({ email: "inconnue@client.example" }));
    expect(Object.keys(inconnue).sort()).toEqual(Object.keys(admise).sort());
    expect(inconnue.erreur).toBeUndefined();
  });

  it("refuse une adresse mal formée ou trop longue, sans rien écrire", async () => {
    for (const email of ["", "pas-une-adresse", "a b@client.example", `${"x".repeat(250)}@client.example`]) {
      expect((await demanderCodeAction({}, formulaire({ email }))).erreur, email).toBeTruthy();
    }
    expect(await query("SELECT 1 FROM codes_connexion")).toEqual([]);
  });

  it("garde l'étape du code quand la limite est atteinte : le code déjà reçu reste valable", async () => {
    const etat = await demanderCodeAction({}, formulaire({ email: ADMISE }));
    const encore = await demanderCodeAction(etat, formulaire({ email: ADMISE }));
    expect(encore.email).toBe(ADMISE);
    expect(encore.erreur).toMatch(/Trop de demandes/);
  });

  it("connecte et renvoie au chemin demandé, filtré, avec le bon code", async () => {
    await demanderCodeAction({}, formulaire({ email: ADMISE }));
    await apresReponse[0]();
    const code = dernierCodeRecu();
    await expect(
      verifierCodeAction({ email: ADMISE }, formulaire({ email: ADMISE, code, retour: "//ailleurs.example" }))
    ).rejects.toMatchObject(UNE_REDIRECTION("/"));
    expect(await sessionsOuvertes()).toBe(1);
  });

  it("répond par une erreur, sans session, à un code faux", async () => {
    await demanderCodeAction({}, formulaire({ email: ADMISE }));
    await apresReponse[0]();
    const etat = await verifierCodeAction(
      { email: ADMISE },
      formulaire({ email: ADMISE, code: autreCode(dernierCodeRecu()) })
    );
    expect(etat).toMatchObject({ email: ADMISE, erreur: expect.stringMatching(/incorrect/) });
    expect(await sessionsOuvertes()).toBe(0);
  });
});
