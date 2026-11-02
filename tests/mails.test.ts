import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envoyerMail, ErreurEnvoi, mailsCaptures, viderMailsCaptures, type Mail } from "@/briques/mails/envoi";

/*
 * Brique mails. Seule frontière simulée : fetch, c'est-à-dire
 * l'API de Resend. Le choix de l'envoyeur se lit dans l'environnement à
 * chaque envoi : les tests le règlent par vi.stubEnv.
 */

const CLE = "re_cle_factice_0123456789";

const MAIL: Mail = {
  a: "personne@exemple.fr",
  objet: "Votre code de connexion",
  contenu: [
    { paragraphe: "Voici votre code, valable 10 minutes :" },
    { code: "481205" },
    { lien: { libelle: "Ouvrir l'application", url: "https://appli.exemple.fr/connexion" } },
  ],
};

function reponse(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { "Content-Type": "application/json" } });
}

// Toutes les sorties qui finissent au journal de l'hébergeur : un envoyeur qui
// écrirait par console.error ou process.stdout passerait un espion sur
// console.info seul.
function espionnerLesSorties() {
  const espions = [
    ...(["log", "info", "warn", "error", "debug"] as const).map((niveau) =>
      vi.spyOn(console, niveau).mockImplementation(() => {})
    ),
    vi.spyOn(process.stdout, "write").mockImplementation(() => true),
    vi.spyOn(process.stderr, "write").mockImplementation(() => true),
  ];
  return { rienEcrit: () => espions.every((espion) => espion.mock.calls.length === 0) };
}

function enProductionAvecResend(fetchSimule: typeof fetch) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MAILS_FOURNISSEUR", "resend");
  vi.stubEnv("RESEND_API_KEY", CLE);
  vi.stubEnv("MAILS_EXPEDITEUR", "Mon appli <ne-pas-repondre@exemple.fr>");
  vi.stubGlobal("fetch", fetchSimule);
}

beforeEach(() => {
  viderMailsCaptures();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("brique mails : en test, rien ne part", () => {
  it("en mode test, aucun appel réseau : le mail est capturé, même si la configuration désigne Resend avec une clé", async () => {
    const espion = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", espion);
    vi.stubEnv("MAILS_FOURNISSEUR", "resend");
    vi.stubEnv("RESEND_API_KEY", CLE);
    vi.stubEnv("MAILS_EXPEDITEUR", "ne-pas-repondre@exemple.fr");

    await envoyerMail(MAIL);

    expect(espion).not.toHaveBeenCalled();
    const [capture] = mailsCaptures();
    expect(mailsCaptures()).toHaveLength(1);
    expect(capture.a).toBe("personne@exemple.fr");
    expect(capture.objet).toBe("Votre code de connexion");
    expect(capture.texte).toContain("481205");
    expect(capture.html).toContain("481205");
  });

  it("vider la capture repart de zéro entre deux tests", async () => {
    await envoyerMail(MAIL);
    expect(mailsCaptures()).toHaveLength(1);
    viderMailsCaptures();
    expect(mailsCaptures()).toEqual([]);
  });
});

describe("brique mails : valeurs échappées (cicatrice : HTML de mail non échappé)", () => {
  it("une valeur contenant <script> arrive échappée, dans l'objet, un paragraphe, un code et un lien", async () => {
    const piege = `<script>alert("x")</script>`;
    await envoyerMail({
      a: "personne@exemple.fr",
      objet: `Contrat ${piege}`,
      contenu: [
        { paragraphe: `Bonjour ${piege} & co` },
        { code: piege },
        { lien: { libelle: piege, url: `https://exemple.fr/?q="><script>alert(1)</script>` } },
      ],
    });

    const [capture] = mailsCaptures();
    expect(capture.html).not.toContain("<script");
    expect(capture.html).not.toMatch(/"><script/);
    expect(capture.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(capture.html).toContain("&amp; co");
    // L'objet et la version texte restent du texte : rien à y échapper.
    expect(capture.objet).toBe(`Contrat ${piege}`);
    expect(capture.texte).toContain(`Bonjour ${piege} & co`);
  });

  it("refuse un lien qui n'est ni https ni http (javascript:, data:), avant tout envoi", async () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "pas une adresse"]) {
      await expect(envoyerMail({ ...MAIL, contenu: [{ lien: { libelle: "Ouvrir", url } }] })).rejects.toThrow(
        ErreurEnvoi
      );
    }
    expect(mailsCaptures()).toEqual([]);
  });
});

describe("brique mails : un message mal formé est refusé avant tout envoi", () => {
  it("refuse un destinataire invalide, un objet vide ou sur plusieurs lignes, un contenu vide", async () => {
    const fautifs: Mail[] = [
      { ...MAIL, a: "pas-une-adresse" },
      { ...MAIL, a: "personne@exemple.fr, autre@exemple.fr" },
      { ...MAIL, a: "personne@exemple.fr\r\nBcc: autre@exemple.fr" },
      { ...MAIL, objet: "  " },
      { ...MAIL, objet: "Objet\r\nBcc: autre@exemple.fr" },
      { ...MAIL, repondreA: "pas-une-adresse" },
      { ...MAIL, contenu: [] },
    ];
    for (const mail of fautifs) await expect(envoyerMail(mail), JSON.stringify(mail)).rejects.toThrow(ErreurEnvoi);
    expect(mailsCaptures()).toEqual([]);
  });
});

describe("brique mails : sûr par défaut hors test", () => {
  it("sans configuration en production, l'envoi échoue en nommant MAILS_FOURNISSEUR, sans rien écrire dans la console ni appeler le réseau", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAILS_FOURNISSEUR", "");
    const espion = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", espion);
    const sorties = espionnerLesSorties();

    const envoi = envoyerMail(MAIL);
    await expect(envoi).rejects.toThrow(/MAILS_FOURNISSEUR/);
    const rienEcrit = sorties.rienEcrit();
    vi.restoreAllMocks();
    expect(espion).not.toHaveBeenCalled();
    expect(rienEcrit).toBe(true);
  });

  it("l'envoyeur console est refusé en production : le contenu d'un mail n'est jamais écrit dans les journaux de prod", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAILS_FOURNISSEUR", "console");
    const sorties = espionnerLesSorties();

    const envoi = envoyerMail(MAIL);
    await expect(envoi).rejects.toThrow(ErreurEnvoi);
    const rienEcrit = sorties.rienEcrit();
    vi.restoreAllMocks();
    expect(rienEcrit).toBe(true);
  });

  it("en développement sans configuration, le mail s'affiche dans la console et ne part pas", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MAILS_FOURNISSEUR", "");
    const espion = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", espion);
    const sortie = vi.spyOn(console, "info").mockImplementation(() => {});

    await envoyerMail(MAIL);

    expect(espion).not.toHaveBeenCalled();
    const affiche = sortie.mock.calls.flat().join("\n");
    expect(affiche).toContain("personne@exemple.fr");
    expect(affiche).toContain("481205");
  });

  it("refuse un fournisseur inconnu plutôt que de choisir à sa place", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MAILS_FOURNISSEUR", "sendgrid");
    await expect(envoyerMail(MAIL)).rejects.toThrow(/sendgrid/);
  });

  it("avec Resend, une clé ou un expéditeur manquant échoue en nommant la variable, sans appel réseau", async () => {
    const espion = vi.fn<typeof fetch>();
    enProductionAvecResend(espion);
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(envoyerMail(MAIL)).rejects.toThrow(/RESEND_API_KEY/);

    vi.stubEnv("RESEND_API_KEY", CLE);
    vi.stubEnv("MAILS_EXPEDITEUR", "");
    await expect(envoyerMail(MAIL)).rejects.toThrow(/MAILS_EXPEDITEUR/);
    expect(espion).not.toHaveBeenCalled();
  });
});

describe("brique mails : envoi par Resend (fetch simulé)", () => {
  it("poste le mail composé à l'API de Resend, avec la clé en en-tête, et rend l'identifiant", async () => {
    const espion = vi.fn<typeof fetch>(async () => reponse(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }));
    enProductionAvecResend(espion);

    const resultat = await envoyerMail({ ...MAIL, repondreA: "contact@exemple.fr" });

    expect(resultat).toEqual({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    expect(espion).toHaveBeenCalledTimes(1);
    const [url, init] = espion.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${CLE}`);
    const corps = JSON.parse(String(init?.body));
    expect(corps).toMatchObject({
      from: "Mon appli <ne-pas-repondre@exemple.fr>",
      to: ["personne@exemple.fr"],
      subject: "Votre code de connexion",
      reply_to: "contact@exemple.fr",
    });
    expect(corps.html).toContain("481205");
    expect(corps.text).toContain("481205");
  });

  it("un refus de Resend lève ErreurEnvoi avec le statut, et le message ne contient jamais la clé ni l'adresse, même si la réponse les renvoie", async () => {
    enProductionAvecResend(
      vi.fn<typeof fetch>(async () =>
        reponse(403, { name: "invalid_api_key", message: `API key ${CLE} is invalid for ${MAIL.a}` })
      )
    );
    const erreur = await envoyerMail(MAIL).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ErreurEnvoi);
    const texte = `${(erreur as Error).message} ${(erreur as Error).stack ?? ""}`;
    expect(texte).toContain("403");
    expect(texte).toContain("invalid_api_key");
    expect(texte).not.toContain(CLE);
    expect(texte).not.toContain(MAIL.a);
  });

  it("Resend injoignable lève ErreurEnvoi, sans la clé dans le message", async () => {
    enProductionAvecResend(
      vi.fn<typeof fetch>(async () => {
        throw new TypeError(`fetch failed (Bearer ${CLE})`);
      })
    );
    const erreur = await envoyerMail(MAIL).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ErreurEnvoi);
    expect((erreur as Error).message).not.toContain(CLE);
    expect((erreur as Error).stack ?? "").not.toContain(CLE);
  });
});
