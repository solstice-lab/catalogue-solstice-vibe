import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookiesDeTest } from "./aide-cookies";
import { supprimerTousLesComptes } from "./aide-comptes";
import { ROLE_PAR_DEFAUT } from "../src/config/acces";
import { query } from "../src/lib/db/client";
import type { ContexteEntree } from "../src/briques/comptes/entree";
import { nomDuCookie } from "../src/briques/comptes/jeton";
import {
  commencerAvecMicrosoft,
  etatDeMicrosoft,
  messageDeRefusMicrosoft,
  terminerAvecMicrosoft,
} from "../src/briques/comptes/microsoft";
import { nomDuCookieDeParcours } from "../src/briques/comptes/parcours";
import { lireSessionDe } from "../src/briques/comptes/session";

/*
 * La connexion avec Microsoft (Entra ID), par OpenID Connect : code
 * d'autorisation, PKCE, state et nonce, comme Google, plus l'annuaire (tenant)
 * d'où vient le compte. Le départ, puis le retour, où Microsoft seul est
 * simulé, à la frontière (fetch vers son point d'échange de jeton). La base
 * est réelle, les cookies sont ceux de tests/setup.ts.
 */

// Les réglages que l'appli remplit (src/config/comptes.ts), changés par test.
// Un accesseur : l'annuaire est relu à chaque appel, comme la configuration.
const reglages = vi.hoisted(() => ({
  methodes: [] as string[],
  annuaires: "un-seul" as string,
}));
vi.mock("../src/config/comptes", () => ({
  METHODES: reglages.methodes,
  get ANNUAIRES_MICROSOFT() {
    return reglages.annuaires;
  },
  DOMAINES_GOOGLE_WORKSPACE: [],
  ENTREE: { adresses: {}, domaines: [] },
}));

const CLIENT_ID = "00000000-0000-4000-8000-00000000c1e7";
const CLIENT_SECRET = "secret-client-de-test";
// L'annuaire du client, un autre annuaire d'entreprise, et celui des comptes
// Microsoft personnels (le même pour tous, documenté par Microsoft).
const ANNUAIRE = "11111111-2222-4333-8444-555555555555";
const AUTRE_ANNUAIRE = "99999999-8888-4777-8666-555555555555";
const COMPTES_PERSONNELS = "9188040d-6c67-4c5b-b112-36a304b66dad";
const ORIGINE = "http://localhost:3000";
const MICROSOFT = "https://login.microsoftonline.com";

const ADMISE = "personne@client.example";
const CONTEXTE: ContexteEntree = {
  entree: { adresses: { [ADMISE]: ROLE_PAR_DEFAUT }, domaines: [] },
  premierAdmin: undefined,
  demo: false,
};

// Le faux Microsoft : il garde chaque échange reçu, et répond par l'ID token
// que le test a préparé. Sans réponse préparée, il répond par une panne.
type Echange = { url: string; corps: URLSearchParams };
let echanges: Echange[] = [];
let reponseDeMicrosoft: (() => Response) | null = null;

function enJson(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });
}

// Un ID token tel que Microsoft le renvoie. La signature n'est pas vérifiée :
// le jeton arrive de Microsoft par TLS, sur son point d'échange (OIDC Core
// 3.1.3.7).
function idToken(revendications: Record<string, unknown>): string {
  const b64 = (objet: unknown) => Buffer.from(JSON.stringify(objet)).toString("base64url");
  return `${b64({ alg: "RS256", kid: "cle-de-test", typ: "JWT" })}.${b64(revendications)}.${Buffer.from("signature").toString("base64url")}`;
}

// L'émetteur d'un jeton de l'annuaire donné, tel que Microsoft l'écrit.
function emetteur(annuaire: string): string {
  return `${MICROSOFT}/${annuaire}/v2.0`;
}

// Microsoft répond, pour le nonce de l'aller, avec ces revendications : un
// compte de l'annuaire du client par défaut, dont l'adresse a un domaine
// vérifié (xms_edov, revendication facultative déclarée dans le portail).
function microsoftRepond(nonce: string, surcharge: Record<string, unknown> = {}): void {
  const maintenant = Math.floor(Date.now() / 1000);
  const revendications = Object.fromEntries(
    Object.entries({
      ver: "2.0",
      iss: emetteur(ANNUAIRE),
      tid: ANNUAIRE,
      aud: CLIENT_ID,
      sub: "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
      oid: "00000000-0000-0000-66f3-3332eca7ea81",
      email: ADMISE,
      xms_edov: true,
      iat: maintenant,
      nbf: maintenant,
      exp: maintenant + 3600,
      nonce,
      ...surcharge,
    }).filter(([, valeur]) => valeur !== undefined)
  );
  reponseDeMicrosoft = () =>
    enJson({
      access_token: "jeton-acces",
      token_type: "Bearer",
      expires_in: 3599,
      scope: "openid email",
      id_token: idToken(revendications),
    });
}

// Un compte d'un autre annuaire : émetteur et tid vont ensemble.
function deLAnnuaire(annuaire: string): Record<string, unknown> {
  return { iss: emetteur(annuaire), tid: annuaire };
}

async function fauxFetch(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(entree instanceof Request ? entree.url : entree);
  echanges.push({ url, corps: new URLSearchParams(String(init?.body ?? "")) });
  if (!/^https:\/\/login\.microsoftonline\.com\/[^/]+\/oauth2\/v2\.0\/token$/.test(url))
    throw new Error(`appel réseau inattendu : ${url}`);
  return reponseDeMicrosoft ? reponseDeMicrosoft() : enJson({ error: "server_error" }, 500);
}

type Aller = { state: string; nonce: string; challenge: string; url: URL };

// Le départ, comme le lien de /connexion : la redirection vers Microsoft.
async function partir(retour = "/dossiers"): Promise<Aller> {
  const reponse = await commencerAvecMicrosoft(
    new NextRequest(`${ORIGINE}/connexion/microsoft?retour=${encodeURIComponent(retour)}`)
  );
  const url = new URL(reponse.headers.get("location") ?? "");
  expect(url.origin).toBe(MICROSOFT);
  return {
    state: url.searchParams.get("state") ?? "",
    nonce: url.searchParams.get("nonce") ?? "",
    challenge: url.searchParams.get("code_challenge") ?? "",
    url,
  };
}

// Le retour de Microsoft sur l'appli, avec ses paramètres.
async function revenir(parametres: Record<string, string>, contexte = CONTEXTE) {
  const url = new URL(`${ORIGINE}/connexion/microsoft/retour`);
  for (const [nom, valeur] of Object.entries(parametres)) url.searchParams.set(nom, valeur);
  return terminerAvecMicrosoft(new NextRequest(url), contexte);
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
  reglages.methodes.splice(0, Infinity, "code-email", "microsoft");
  reglages.annuaires = "un-seul";
  vi.stubEnv("MICROSOFT_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("MICROSOFT_TENANT_ID", ANNUAIRE);
  echanges = [];
  reponseDeMicrosoft = null;
  vi.stubGlobal("fetch", fauxFetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connexion avec Microsoft : le départ", () => {
  it("part vers l'annuaire du client avec un code, PKCE en S256, un state, un nonce et l'adresse de retour de l'appli, sans le secret", async () => {
    const aller = await partir();
    const p = aller.url.searchParams;
    expect(aller.url.pathname).toBe(`/${ANNUAIRE}/oauth2/v2.0/authorize`);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe(CLIENT_ID);
    expect(p.get("redirect_uri")).toBe(`${ORIGINE}/connexion/microsoft/retour`);
    expect(p.get("scope")).toBe("openid email");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(aller.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(aller.state).not.toBe("");
    expect(aller.nonce).not.toBe("");
    expect(aller.state).not.toBe(aller.nonce);
    expect(p.get("prompt")).toBe("select_account");
    expect(aller.url.href).not.toContain(CLIENT_SECRET);
    expect(cookiesDeTest.has(nomDuCookieDeParcours("microsoft"))).toBe(true);
  });

  it("tire un state, un nonce et un verifier neufs à chaque départ : rejoués, ils ne protégeraient rien", async () => {
    const premier = await partir();
    const second = await partir();
    expect(second.state).not.toBe(premier.state);
    expect(second.nonce).not.toBe(premier.nonce);
    expect(second.challenge).not.toBe(premier.challenge);
  });

  it("part vers le point commun à tous les annuaires quand l'appli les accepte tous, sans exiger l'ID de l'annuaire", async () => {
    reglages.annuaires = "tous";
    vi.stubEnv("MICROSOFT_TENANT_ID", "");
    expect((await partir()).url.pathname).toBe("/common/oauth2/v2.0/authorize");
  });

  it("refuse de partir quand la méthode n'est pas dans METHODES : une route s'appelle sans passer par l'écran", async () => {
    reglages.methodes.splice(0, Infinity, "code-email");
    const reponse = await commencerAvecMicrosoft(new NextRequest(`${ORIGINE}/connexion/microsoft`));
    expect(reponse.status).toBe(404);
    expect(reponse.headers.get("location")).toBeNull();
  });

  it("renvoie vers /connexion, qui dit quoi régler, quand une variable manque, sans jamais partir vers Microsoft", async () => {
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
    const reponse = await commencerAvecMicrosoft(new NextRequest(`${ORIGINE}/connexion/microsoft`));
    expect(destination(reponse)).toBe("/connexion");
    expect(cookiesDeTest.has(nomDuCookieDeParcours("microsoft"))).toBe(false);
    expect(etatDeMicrosoft()).toEqual({ configure: false, manquantes: ["MICROSOFT_CLIENT_SECRET"] });
    vi.stubEnv("MICROSOFT_CLIENT_ID", " ");
    vi.stubEnv("MICROSOFT_TENANT_ID", "");
    expect(etatDeMicrosoft()).toEqual({
      configure: false,
      manquantes: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID"],
    });
  });

  it("tient pour absent un ID d'annuaire qui n'est pas un GUID : avec le nom de domaine, chaque jeton serait refusé sur son émetteur, sans dire pourquoi", () => {
    vi.stubEnv("MICROSOFT_TENANT_ID", "client.onmicrosoft.com");
    expect(etatDeMicrosoft()).toEqual({ configure: false, manquantes: ["MICROSOFT_TENANT_ID"] });
  });
});

describe("connexion avec Microsoft : le retour, PKCE, state et nonce", () => {
  it("connecte une adresse admise et revient sur le chemin demandé, en échangeant le code chez l'annuaire du client avec le verifier dont le challenge est l'empreinte", async () => {
    const aller = await partir("/dossiers?vue=2");
    microsoftRepond(aller.nonce);
    const reponse = await revenir({ code: "code-de-microsoft", state: aller.state });

    expect(destination(reponse)).toBe("/dossiers?vue=2");
    expect(echanges).toHaveLength(1);
    expect(echanges[0].url).toBe(`${MICROSOFT}/${ANNUAIRE}/oauth2/v2.0/token`);
    const corps = echanges[0].corps;
    expect(corps.get("grant_type")).toBe("authorization_code");
    expect(corps.get("code")).toBe("code-de-microsoft");
    expect(corps.get("redirect_uri")).toBe(`${ORIGINE}/connexion/microsoft/retour`);
    expect(corps.get("client_secret")).toBe(CLIENT_SECRET);
    const verifier = corps.get("code_verifier") ?? "";
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(aller.challenge);

    expect(await sessionsOuvertes()).toBe(1);
    expect(await lireSessionDe(cookiesDeTest.get(nomDuCookie()), CONTEXTE)).toEqual({
      email: ADMISE,
      role: ROLE_PAR_DEFAUT,
    });
    // Le cookie de parcours ne sert qu'une fois.
    expect(cookiesDeTest.has(nomDuCookieDeParcours("microsoft"))).toBe(false);
  });

  it("refuse un state qui n'est pas celui du départ, sans même échanger le code : c'est la connexion forcée d'un tiers (CSRF)", async () => {
    const aller = await partir();
    microsoftRepond(aller.nonce);
    await aucuneConnexion(await revenir({ code: "code-du-tiers", state: "state-du-tiers" }), "microsoft-expire");
    expect(echanges).toEqual([]);
  });

  it("refuse un retour sans cookie de parcours : un lien de retour envoyé par un tiers ne connecte personne", async () => {
    const aller = await partir();
    microsoftRepond(aller.nonce);
    cookiesDeTest.delete(nomDuCookieDeParcours("microsoft"));
    await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-expire");
    expect(echanges).toEqual([]);
  });

  it("ne connecte qu'une fois par départ : le même retour rejoué est refusé", async () => {
    const aller = await partir();
    microsoftRepond(aller.nonce);
    expect(destination(await revenir({ code: "code-de-microsoft", state: aller.state }))).toBe("/dossiers");
    await query("DELETE FROM sessions");
    cookiesDeTest.delete(nomDuCookie());
    await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-expire");
  });

  it("refuse un ID token dont le nonce n'est pas celui du départ : un jeton rejoué d'une autre connexion", async () => {
    const aller = await partir();
    microsoftRepond("nonce-d-une-autre-connexion");
    await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-expire");
  });

  it("refuse un ID token émis pour une autre application, expiré, ou par un autre émetteur que Microsoft", async () => {
    const passe = Math.floor(Date.now() / 1000) - 7200;
    for (const surcharge of [
      { aud: "autre-application" },
      { iat: passe, nbf: passe, exp: passe + 3600 },
      { iss: `https://faux-microsoft.example/${ANNUAIRE}/v2.0` },
    ]) {
      const aller = await partir();
      microsoftRepond(aller.nonce, surcharge);
      await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-expire");
    }
  });

  it("revient sur l'accueil quand le chemin de retour mène hors de l'appli", async () => {
    const aller = await partir("//site.example");
    microsoftRepond(aller.nonce);
    expect(destination(await revenir({ code: "code-de-microsoft", state: aller.state }))).toBe("/");
  });

  it("dit l'annulation quand la personne refuse chez Microsoft, sans session", async () => {
    const aller = await partir();
    await aucuneConnexion(await revenir({ error: "access_denied", state: aller.state }), "microsoft-annule");
    expect(echanges).toEqual([]);
  });

  it("dit que Microsoft n'a pas répondu quand l'échange échoue, sans écrire au journal ni le code ni le secret", async () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    const aller = await partir();
    await aucuneConnexion(
      await revenir({ code: "code-secret-de-microsoft", state: aller.state }),
      "microsoft-indisponible"
    );
    const ecrit = journal.mock.calls.flat().map(String).join(" ");
    expect(ecrit).not.toContain("code-secret-de-microsoft");
    expect(ecrit).not.toContain(CLIENT_SECRET);
  });

  it("dit que la configuration est fausse quand Microsoft refuse l'ID client ou le secret : réessayer n'y changerait rien", async () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    const aller = await partir();
    reponseDeMicrosoft = () => enJson({ error: "invalid_client", error_description: "AADSTS7000215" }, 401);
    await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-configuration");
    expect(journal.mock.calls.flat().map(String).join(" ")).toContain("invalid_client");
  });

  it("refuse le retour quand la méthode a été retirée de METHODES entre-temps", async () => {
    const aller = await partir();
    microsoftRepond(aller.nonce);
    reglages.methodes.splice(0, Infinity, "code-email");
    const reponse = await revenir({ code: "code-de-microsoft", state: aller.state });
    expect(reponse.status).toBe(404);
    expect(await sessionsOuvertes()).toBe(0);
  });
});

describe("connexion avec Microsoft : l'annuaire", () => {
  it("avec un seul annuaire, refuse le compte d'un autre annuaire ou un compte personnel, même listé dans ENTREE", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const surcharge of [deLAnnuaire(AUTRE_ANNUAIRE), deLAnnuaire(COMPTES_PERSONNELS), { tid: AUTRE_ANNUAIRE }]) {
      const aller = await partir();
      microsoftRepond(aller.nonce, surcharge);
      await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-acces");
    }
  });

  it("avec un seul annuaire, refuse un jeton sans tid, même émis par l'annuaire du client", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const aller = await partir();
    microsoftRepond(aller.nonce, { tid: undefined });
    await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-expire");
  });

  it("avec tous les annuaires, connecte le compte d'un autre annuaire et un compte personnel, en échangeant le code au point commun", async () => {
    reglages.annuaires = "tous";
    for (const annuaire of [AUTRE_ANNUAIRE, COMPTES_PERSONNELS]) {
      await query("DELETE FROM sessions");
      echanges = [];
      const aller = await partir();
      microsoftRepond(aller.nonce, deLAnnuaire(annuaire));
      expect(destination(await revenir({ code: "code-de-microsoft", state: aller.state })), annuaire).toBe("/dossiers");
      expect(echanges.map((echange) => echange.url)).toEqual([`${MICROSOFT}/common/oauth2/v2.0/token`]);
      expect(await sessionsOuvertes()).toBe(1);
    }
  });

  it("avec tous les annuaires, refuse un jeton dont l'émetteur n'est pas celui de son annuaire (tid)", async () => {
    reglages.annuaires = "tous";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const surcharge of [
      { iss: emetteur(ANNUAIRE), tid: AUTRE_ANNUAIRE },
      { iss: emetteur("common"), tid: "common" },
      { tid: undefined },
    ]) {
      const aller = await partir();
      microsoftRepond(aller.nonce, surcharge);
      await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-expire");
    }
  });
});

describe("connexion avec Microsoft : le message de /connexion", () => {
  it("n'affiche un message que pour un code de refus connu, jamais un texte tiré de l'adresse", () => {
    expect(messageDeRefusMicrosoft("microsoft-acces")).toBe(
      "Ce compte Microsoft n'a pas accès à l'appli. Contacter l'équipe technique."
    );
    for (const autre of [undefined, "", "google-acces", "constructor", "__proto__", "<script>alert(1)</script>"]) {
      expect(messageDeRefusMicrosoft(autre), String(autre)).toBeNull();
    }
  });
});

describe("connexion avec Microsoft : qui entre", () => {
  it("refuse une adresse dont Microsoft ne garantit pas le domaine (xms_edov), même listée : dans un autre annuaire, son administrateur écrit l'adresse qu'il veut", async () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const xms_edov of [false, undefined, "true", 1]) {
      const aller = await partir();
      microsoftRepond(aller.nonce, { xms_edov });
      await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-acces");
    }
    // Le journal dit pourquoi, sans l'adresse : sans la revendication déclarée
    // dans le portail, tout le monde est refusé, et c'est là qu'on le voit.
    const ecrit = journal.mock.calls.flat().map(String).join(" ");
    expect(ecrit).toContain("xms_edov");
    expect(ecrit).not.toContain(ADMISE);
  });

  it("refuse un compte sans adresse e-mail dans le jeton", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const aller = await partir();
    microsoftRepond(aller.nonce, { email: undefined, preferred_username: ADMISE });
    await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-acces");
  });

  it("refuse une adresse hors de la liste d'accès, même garantie par Microsoft (critère d'acceptation)", async () => {
    const aller = await partir();
    microsoftRepond(aller.nonce, { email: "quelquun@ailleurs.example" });
    await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-acces");
  });

  it("refuse un compte désactivé, même vérifié par Microsoft", async () => {
    await query("INSERT INTO utilisateurs (email, role, actif) VALUES ($1, $2, false)", [ADMISE, ROLE_PAR_DEFAUT]);
    const aller = await partir();
    microsoftRepond(aller.nonce);
    await aucuneConnexion(await revenir({ code: "code-de-microsoft", state: aller.state }), "microsoft-acces");
  });

  it("connecte une adresse admise écrite avec des majuscules dans l'annuaire", async () => {
    const aller = await partir();
    microsoftRepond(aller.nonce, { email: "Personne@Client.Example" });
    expect(destination(await revenir({ code: "code-de-microsoft", state: aller.state }))).toBe("/dossiers");
    expect(await lireSessionDe(cookiesDeTest.get(nomDuCookie()), CONTEXTE)).toEqual({
      email: ADMISE,
      role: ROLE_PAR_DEFAUT,
    });
  });
});
