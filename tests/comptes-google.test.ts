import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookiesDeTest } from "./aide-cookies";
import { supprimerTousLesComptes } from "./aide-comptes";
import { ROLE_PAR_DEFAUT } from "../src/config/acces";
import { query } from "../src/lib/db/client";
import { admettre, type ContexteEntree } from "../src/briques/comptes/entree";
import {
  commencerAvecGoogle,
  etatDeGoogle,
  messageDeRefusGoogle,
  terminerAvecGoogle,
} from "../src/briques/comptes/google";
import { nomDuCookie } from "../src/briques/comptes/jeton";
import { nomDuCookieDeParcours } from "../src/briques/comptes/parcours";
import { lireSessionDe, ouvrirSession } from "../src/briques/comptes/session";

/*
 * La connexion avec Google, par OpenID Connect : code
 * d'autorisation, PKCE, state et nonce. Chaque règle de sécurité a son test,
 * de bout en bout : le départ (redirection vers Google, cookie de parcours),
 * puis le retour, où Google seul est simulé, à la frontière (fetch vers son
 * point d'échange de jeton). La base est réelle, les cookies sont ceux de
 * tests/setup.ts.
 */

// Les réglages que l'appli remplit (src/config/comptes.ts), changés par test.
const reglages = vi.hoisted(() => ({
  methodes: [] as string[],
  domaines: [] as string[],
}));
vi.mock("../src/config/comptes", () => ({
  METHODES: reglages.methodes,
  DOMAINES_GOOGLE_WORKSPACE: reglages.domaines,
  ENTREE: { adresses: {}, domaines: [] },
}));

const CLIENT_ID = "id-client-de-test.apps.googleusercontent.com";
const CLIENT_SECRET = "secret-client-de-test";
const ORIGINE = "http://localhost:3000";
const ECHANGE = "https://oauth2.googleapis.com/token";

const ADMISE = "personne@client.example";
const GMAIL = "personne@gmail.com";
const CONTEXTE: ContexteEntree = {
  entree: { adresses: { [ADMISE]: ROLE_PAR_DEFAUT, [GMAIL]: ROLE_PAR_DEFAUT }, domaines: [] },
  premierAdmin: undefined,
  demo: false,
};

// Le faux Google : il garde chaque échange reçu, et répond par l'ID token que
// le test a préparé. Sans réponse préparée, il répond par une panne.
type Echange = { url: string; corps: URLSearchParams };
let echanges: Echange[] = [];
let reponseDeGoogle: (() => Response) | null = null;

function enJson(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });
}

// Un ID token tel que Google le renvoie. La signature n'est pas vérifiée : le
// jeton arrive de Google par TLS, sur son point d'échange (OIDC Core 3.1.3.7).
function idToken(revendications: Record<string, unknown>): string {
  const b64 = (objet: unknown) => Buffer.from(JSON.stringify(objet)).toString("base64url");
  return `${b64({ alg: "RS256", kid: "cle-de-test", typ: "JWT" })}.${b64(revendications)}.${Buffer.from("signature").toString("base64url")}`;
}

// Google répond, pour le nonce de l'aller, avec ces revendications.
function googleRepond(nonce: string, surcharge: Record<string, unknown> = {}): void {
  const maintenant = Math.floor(Date.now() / 1000);
  const revendications = Object.fromEntries(
    Object.entries({
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      azp: CLIENT_ID,
      sub: "110248495921238986420",
      email: ADMISE,
      email_verified: true,
      hd: "client.example",
      iat: maintenant,
      exp: maintenant + 3600,
      nonce,
      ...surcharge,
    }).filter(([, valeur]) => valeur !== undefined)
  );
  reponseDeGoogle = () =>
    enJson({
      access_token: "jeton-acces",
      token_type: "Bearer",
      expires_in: 3599,
      scope: "openid email",
      id_token: idToken(revendications),
    });
}

async function fauxFetch(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(entree instanceof Request ? entree.url : entree);
  echanges.push({ url, corps: new URLSearchParams(String(init?.body ?? "")) });
  if (url !== ECHANGE) throw new Error(`appel réseau inattendu : ${url}`);
  return reponseDeGoogle ? reponseDeGoogle() : enJson({ error: "server_error" }, 500);
}

type Aller = { state: string; nonce: string; challenge: string; url: URL };

// Le départ, comme le lien de /connexion : la redirection vers Google.
async function partir(retour = "/dossiers"): Promise<Aller> {
  const reponse = await commencerAvecGoogle(
    new NextRequest(`${ORIGINE}/connexion/google?retour=${encodeURIComponent(retour)}`)
  );
  const url = new URL(reponse.headers.get("location") ?? "");
  expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  return {
    state: url.searchParams.get("state") ?? "",
    nonce: url.searchParams.get("nonce") ?? "",
    challenge: url.searchParams.get("code_challenge") ?? "",
    url,
  };
}

// Le retour de Google sur l'appli, avec ses paramètres.
async function revenir(parametres: Record<string, string>, contexte = CONTEXTE) {
  const url = new URL(`${ORIGINE}/connexion/google/retour`);
  for (const [nom, valeur] of Object.entries(parametres)) url.searchParams.set(nom, valeur);
  return terminerAvecGoogle(new NextRequest(url), contexte);
}

function destination(reponse: Response): string {
  const vers = new URL(reponse.headers.get("location") ?? "");
  return vers.pathname + vers.search;
}

async function sessionsOuvertes(): Promise<number> {
  return (await query("SELECT 1 FROM sessions")).length;
}

async function aucuneConnexion(reponse: Response, erreur: string): Promise<void> {
  expect(destination(reponse)).toBe(`/connexion?erreur=${erreur}`);
  expect(await sessionsOuvertes()).toBe(0);
  expect(cookiesDeTest.has(nomDuCookie())).toBe(false);
}

beforeEach(async () => {
  await supprimerTousLesComptes();
  reglages.methodes.splice(0, Infinity, "code-email", "google");
  reglages.domaines.splice(0, Infinity);
  vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", CLIENT_SECRET);
  echanges = [];
  reponseDeGoogle = null;
  vi.stubGlobal("fetch", fauxFetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connexion avec Google : le départ", () => {
  it("part vers Google avec un code, PKCE en S256, un state, un nonce et l'adresse de retour de l'appli, sans écran de consentement superflu", async () => {
    const aller = await partir();
    const p = aller.url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe(CLIENT_ID);
    expect(p.get("redirect_uri")).toBe(`${ORIGINE}/connexion/google/retour`);
    expect(p.get("scope")).toBe("openid email");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(aller.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(aller.state).not.toBe("");
    expect(aller.nonce).not.toBe("");
    expect(aller.state).not.toBe(aller.nonce);
    expect(p.get("prompt")).toBe("select_account");
    // Le secret ne part jamais dans une adresse que le navigateur voit.
    expect(aller.url.href).not.toContain(CLIENT_SECRET);
    expect(cookiesDeTest.has(nomDuCookieDeParcours("google"))).toBe(true);
  });

  it("tire un state, un nonce et un verifier neufs à chaque départ : rejoués, ils ne protégeraient rien", async () => {
    const premier = await partir();
    const second = await partir();
    expect(second.state).not.toBe(premier.state);
    expect(second.nonce).not.toBe(premier.nonce);
    expect(second.challenge).not.toBe(premier.challenge);
  });

  it("indique le domaine Workspace à Google quand un seul est configuré, et tout Workspace quand il y en a plusieurs", async () => {
    expect((await partir()).url.searchParams.has("hd")).toBe(false);
    reglages.domaines.push("client.example");
    expect((await partir()).url.searchParams.get("hd")).toBe("client.example");
    reglages.domaines.push("filiale.example");
    expect((await partir()).url.searchParams.get("hd")).toBe("*");
  });

  it("refuse de partir quand la méthode n'est pas dans METHODES : une route s'appelle sans passer par l'écran", async () => {
    reglages.methodes.splice(0, Infinity, "code-email");
    const reponse = await commencerAvecGoogle(new NextRequest(`${ORIGINE}/connexion/google`));
    expect(reponse.status).toBe(404);
    expect(reponse.headers.get("location")).toBeNull();
  });

  it("renvoie vers /connexion, qui dit quoi régler, quand l'identifiant ou le secret manque, sans jamais partir vers Google", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const reponse = await commencerAvecGoogle(new NextRequest(`${ORIGINE}/connexion/google`));
    expect(destination(reponse)).toBe("/connexion");
    expect(cookiesDeTest.has(nomDuCookieDeParcours("google"))).toBe(false);
    expect(etatDeGoogle()).toEqual({ configure: false, manquantes: ["GOOGLE_CLIENT_SECRET"] });
    vi.stubEnv("GOOGLE_CLIENT_ID", " ");
    expect(etatDeGoogle()).toEqual({ configure: false, manquantes: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] });
  });
});

describe("connexion avec Google : le retour, PKCE, state et nonce", () => {
  it("connecte une adresse admise et revient sur le chemin demandé, en envoyant à Google le verifier dont le challenge est l'empreinte", async () => {
    const aller = await partir("/dossiers?vue=2");
    googleRepond(aller.nonce);
    const reponse = await revenir({ code: "code-de-google", state: aller.state });

    expect(destination(reponse)).toBe("/dossiers?vue=2");
    expect(echanges).toHaveLength(1);
    const corps = echanges[0].corps;
    expect(corps.get("grant_type")).toBe("authorization_code");
    expect(corps.get("code")).toBe("code-de-google");
    expect(corps.get("redirect_uri")).toBe(`${ORIGINE}/connexion/google/retour`);
    expect(corps.get("client_secret")).toBe(CLIENT_SECRET);
    const verifier = corps.get("code_verifier") ?? "";
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(aller.challenge);

    expect(await sessionsOuvertes()).toBe(1);
    expect(await lireSessionDe(cookiesDeTest.get(nomDuCookie()), CONTEXTE)).toEqual({
      email: ADMISE,
      role: ROLE_PAR_DEFAUT,
    });
    // Le cookie de parcours ne sert qu'une fois.
    expect(cookiesDeTest.has(nomDuCookieDeParcours("google"))).toBe(false);
  });

  it("refuse un state qui n'est pas celui du départ, sans même échanger le code : c'est la connexion forcée d'un tiers (CSRF)", async () => {
    const aller = await partir();
    googleRepond(aller.nonce);
    await aucuneConnexion(await revenir({ code: "code-du-tiers", state: "state-du-tiers" }), "google-expire");
    expect(echanges).toEqual([]);
  });

  it("refuse un retour sans cookie de parcours : un lien de retour envoyé par un tiers ne connecte personne", async () => {
    const aller = await partir();
    googleRepond(aller.nonce);
    cookiesDeTest.delete(nomDuCookieDeParcours("google"));
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-expire");
    expect(echanges).toEqual([]);
  });

  it("refuse un cookie de parcours retouché : sa signature ne correspond plus", async () => {
    const aller = await partir();
    googleRepond(aller.nonce);
    const nom = nomDuCookieDeParcours("google");
    const [donnees, signature] = (cookiesDeTest.get(nom) ?? "").split(".");
    const retouche = JSON.parse(Buffer.from(donnees, "base64url").toString());
    retouche.retour = "/une-page";
    cookiesDeTest.set(nom, `${Buffer.from(JSON.stringify(retouche)).toString("base64url")}.${signature}`);
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-expire");
  });

  it("refuse un cookie de parcours de plus de 10 minutes, même encore présent dans le navigateur", async () => {
    const aller = await partir();
    googleRepond(aller.nonce);
    vi.useFakeTimers({ now: Date.now() + 11 * 60 * 1000, toFake: ["Date"] });
    try {
      await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-expire");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ne connecte qu'une fois par départ : le même retour rejoué est refusé", async () => {
    const aller = await partir();
    googleRepond(aller.nonce);
    expect(destination(await revenir({ code: "code-de-google", state: aller.state }))).toBe("/dossiers");
    await query("DELETE FROM sessions");
    cookiesDeTest.delete(nomDuCookie());
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-expire");
  });

  it("refuse un ID token dont le nonce n'est pas celui du départ : un jeton rejoué d'une autre connexion", async () => {
    const aller = await partir();
    googleRepond("nonce-d-une-autre-connexion");
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-expire");
  });

  it("refuse un ID token émis pour une autre application, ou par un autre émetteur que Google", async () => {
    for (const surcharge of [
      { aud: "autre-client.apps.googleusercontent.com" },
      { iss: "https://faux-google.example" },
    ]) {
      const aller = await partir();
      googleRepond(aller.nonce, surcharge);
      await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-expire");
    }
  });

  it("revient sur l'accueil quand le chemin de retour mène hors de l'appli", async () => {
    for (const hostile of ["//site.example", "/\\site.example", "https://site.example", "/.//site.example"]) {
      await query("DELETE FROM sessions");
      const aller = await partir(hostile);
      googleRepond(aller.nonce);
      expect(destination(await revenir({ code: "code-de-google", state: aller.state })), hostile).toBe("/");
    }
  });

  it("dit l'annulation quand la personne refuse chez Google, sans session", async () => {
    const aller = await partir();
    await aucuneConnexion(await revenir({ error: "access_denied", state: aller.state }), "google-annule");
    expect(echanges).toEqual([]);
  });

  it("dit que Google n'a pas répondu quand l'échange échoue, sans écrire au journal ni le code ni le secret", async () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    const aller = await partir();
    await aucuneConnexion(await revenir({ code: "code-secret-de-google", state: aller.state }), "google-indisponible");
    const ecrit = journal.mock.calls.flat().map(String).join(" ");
    expect(ecrit).not.toContain("code-secret-de-google");
    expect(ecrit).not.toContain(CLIENT_SECRET);
  });

  it("refuse un ID token expiré, ou destiné à plusieurs applications et présenté par une autre (azp)", async () => {
    const passe = Math.floor(Date.now() / 1000) - 7200;
    const autre = "autre-client.apps.googleusercontent.com";
    for (const surcharge of [
      { iat: passe, exp: passe + 3600 },
      { aud: [CLIENT_ID, autre], azp: autre },
    ]) {
      const aller = await partir();
      googleRepond(aller.nonce, surcharge);
      await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-expire");
    }
  });

  it("refuse un cookie de parcours dont la signature porte un caractère hors base64url, sans planter : la comparaison à temps constant levait une erreur sur deux longueurs d'octets différentes (relevé en relecture)", async () => {
    const aller = await partir();
    googleRepond(aller.nonce);
    const nom = nomDuCookieDeParcours("google");
    const [donnees, signature] = (cookiesDeTest.get(nom) ?? "").split(".");
    cookiesDeTest.set(nom, `${donnees}.é${signature.slice(1)}`);
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-expire");
  });

  it("ferme la session que le navigateur portait déjà : un cookie posé avant la connexion ne lui survit pas (fixation de session)", async () => {
    const autre = await admettre(GMAIL, CONTEXTE);
    if (!autre) throw new Error("compte de test non admis");
    await ouvrirSession(autre);
    const avant = cookiesDeTest.get(nomDuCookie());
    const aller = await partir();
    googleRepond(aller.nonce);
    await revenir({ code: "code-de-google", state: aller.state });
    expect(await lireSessionDe(avant, CONTEXTE)).toBeNull();
    expect(await sessionsOuvertes()).toBe(1);
    expect(await lireSessionDe(cookiesDeTest.get(nomDuCookie()), CONTEXTE)).toEqual({
      email: ADMISE,
      role: ROLE_PAR_DEFAUT,
    });
  });

  it("revient sur l'accueil pour un chemin de retour démesuré : le cookie de parcours dépasserait la limite des navigateurs, qui l'ignorent sans rien dire", async () => {
    const aller = await partir(`/dossiers?filtre=${"x".repeat(5000)}`);
    googleRepond(aller.nonce);
    expect((cookiesDeTest.get(nomDuCookieDeParcours("google")) ?? "").length).toBeLessThan(3000);
    expect(destination(await revenir({ code: "code-de-google", state: aller.state }))).toBe("/");
  });

  it("dit que la configuration est fausse quand Google refuse l'ID client ou le secret : réessayer n'y changerait rien", async () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    const aller = await partir();
    reponseDeGoogle = () => enJson({ error: "invalid_client", error_description: "Unauthorized" }, 401);
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-configuration");
    expect(journal.mock.calls.flat().map(String).join(" ")).toContain("invalid_client");
  });

  it("dit que Google n'a pas répondu quand sa réponse n'a pas d'ID token", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const aller = await partir();
    reponseDeGoogle = () => enJson({ access_token: "jeton-acces", token_type: "Bearer", expires_in: 3599 });
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-indisponible");
  });

  it("refuse le retour quand la méthode a été retirée de METHODES entre-temps", async () => {
    const aller = await partir();
    googleRepond(aller.nonce);
    reglages.methodes.splice(0, Infinity, "code-email");
    const reponse = await revenir({ code: "code-de-google", state: aller.state });
    expect(reponse.status).toBe(404);
    expect(await sessionsOuvertes()).toBe(0);
  });
});

describe("connexion avec Google : le message de /connexion", () => {
  it("n'affiche un message que pour un code de refus connu, jamais un texte tiré de l'adresse", () => {
    expect(messageDeRefusGoogle("google-acces")).toBe(
      "Ce compte Google n'a pas accès à l'appli. Contacter l'équipe technique."
    );
    for (const autre of [
      undefined,
      "",
      "inconnu",
      "constructor",
      "__proto__",
      "toString",
      "<script>alert(1)</script>",
    ]) {
      expect(messageDeRefusGoogle(autre), String(autre)).toBeNull();
    }
  });
});

describe("connexion avec Google : qui entre", () => {
  it("refuse une adresse que Google n'a pas vérifiée, même listée dans ENTREE", async () => {
    for (const email_verified of [false, undefined, "true"]) {
      const aller = await partir();
      googleRepond(aller.nonce, { email_verified });
      await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-acces");
    }
  });

  it("refuse une adresse dont Google ne fait pas autorité (ni Gmail, ni Workspace), même listée : un compte Google ouvert avec l'adresse d'une entreprise survit au départ de la personne", async () => {
    const aller = await partir();
    googleRepond(aller.nonce, { hd: undefined });
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-acces");
  });

  it("connecte une adresse Gmail listée, dont Google fait autorité sans Workspace", async () => {
    const aller = await partir();
    googleRepond(aller.nonce, { email: GMAIL, hd: undefined });
    expect(destination(await revenir({ code: "code-de-google", state: aller.state }))).toBe("/dossiers");
    expect(await sessionsOuvertes()).toBe(1);
  });

  it("avec un domaine Workspace configuré, refuse un compte d'un autre Workspace ou un Gmail, même listés dans ENTREE : hd se vérifie dans le jeton, pas dans l'adresse de départ", async () => {
    reglages.domaines.push("client.example");
    for (const surcharge of [{ hd: "autre.example" }, { email: GMAIL, hd: undefined }]) {
      const aller = await partir();
      expect(aller.url.searchParams.get("hd")).toBe("client.example");
      googleRepond(aller.nonce, surcharge);
      await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-acces");
    }
  });

  it("avec un domaine Workspace configuré, refuse encore une adresse que la liste d'accès n'admet pas : le domaine s'ajoute à ENTREE, il ne la remplace pas", async () => {
    reglages.domaines.push("client.example");
    const aller = await partir();
    googleRepond(aller.nonce, { email: "inconnue@client.example" });
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-acces");
  });

  it("connecte une adresse du domaine Workspace configuré qu'admet la liste d'accès, casse du domaine comprise", async () => {
    reglages.domaines.push("Client.Example");
    const aller = await partir();
    googleRepond(aller.nonce, { email: "Personne@Client.Example" });
    expect(destination(await revenir({ code: "code-de-google", state: aller.state }))).toBe("/dossiers");
    expect(await lireSessionDe(cookiesDeTest.get(nomDuCookie()), CONTEXTE)).toEqual({
      email: ADMISE,
      role: ROLE_PAR_DEFAUT,
    });
  });

  it("refuse une adresse hors domaine et hors liste (critère d'acceptation)", async () => {
    const aller = await partir();
    googleRepond(aller.nonce, { email: "quelquun@ailleurs.example", hd: "ailleurs.example" });
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-acces");
  });

  it("refuse un compte désactivé, même vérifié par Google", async () => {
    await query("INSERT INTO utilisateurs (email, role, actif) VALUES ($1, $2, false)", [ADMISE, ROLE_PAR_DEFAUT]);
    const aller = await partir();
    googleRepond(aller.nonce);
    await aucuneConnexion(await revenir({ code: "code-de-google", state: aller.state }), "google-acces");
  });
});
