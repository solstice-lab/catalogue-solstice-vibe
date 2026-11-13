import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jouer, jouerLaConnexion } from "./aide-session";
import { query } from "../src/lib/db/client";
import { UTILISATEURS_DEMO } from "../src/briques/comptes/demo";
import { DROITS } from "../src/config/acces";
import * as routeMesDonnees from "../src/app/mes-donnees/export/route";
import * as routeAdmin from "../src/app/donnees-personnelles/export/route";
import { apercevoirEffacementAction, effacerAction } from "../src/app/donnees-personnelles/actions";

/*
 * Les deux portes de l'export : la personne connectée pour ses propres
 * données, l'admin pour une adresse donnée (un compte désactivé ne se connecte
 * plus, une personne sans compte a aussi des données). Une adresse ne passe
 * jamais dans l'URL : elle finirait dans les journaux de l'hébergeur.
 */

const ICI = "https://appli.exemple.test";

function postAdmin(adresse: string, enTetes: Record<string, string> = { origin: ICI, host: "appli.exemple.test" }) {
  const corps = new URLSearchParams({ adresse });
  return routeAdmin.POST(
    new Request(`${ICI}/donnees-personnelles/export`, {
      method: "POST",
      body: corps,
      headers: { "content-type": "application/x-www-form-urlencoded", ...enTetes },
    })
  );
}

afterEach(() => {
  jouer("admin");
});

describe("export de ses propres données", () => {
  it("donne un fichier JSON en pièce jointe, jamais gardé en cache", async () => {
    jouer("membre");
    const reponse = await routeMesDonnees.GET();
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-type")).toMatch(/application\/json/);
    expect(reponse.headers.get("content-disposition")).toMatch(
      /^attachment; filename="donnees-personnelles-\d{4}-\d{2}-\d{2}\.json"$/
    );
    expect(reponse.headers.get("cache-control")).toBe("no-store");
  });

  // Seule la session dit qui l'on est : une adresse lue dans la requête
  // ouvrirait les données des autres à tout membre. La route ne reçoit donc
  // même pas la requête.
  it("exporte l'adresse de la session, sans lire la requête", async () => {
    jouer("membre");
    expect(routeMesDonnees.GET.length).toBe(0);
    const contenu = (await (await routeMesDonnees.GET()).json()) as { adresse: string };
    expect(contenu.adresse).toBe(UTILISATEURS_DEMO.membre.email);
  });

  it("répond 404 sans personne connectée", async () => {
    jouer(null);
    expect((await routeMesDonnees.GET()).status).toBe(404);
  });
});

describe("export par l'admin pour une adresse donnée", () => {
  it("est réservé à l'admin dans les droits du catalogue", () => {
    expect(DROITS["donnees.exporter"]).toEqual(["admin"]);
    expect(DROITS["mes-donnees.exporter"]).toEqual(["membre", "admin"]);
  });

  it("exporte l'adresse postée, en pièce jointe", async () => {
    jouer("admin");
    const reponse = await postAdmin("Quelquun@Exemple.test");
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(((await reponse.json()) as { adresse: string }).adresse).toBe("quelquun@exemple.test");
  });

  it("répond 404 à un membre, comme à une adresse qui n'existerait pas", async () => {
    jouer("membre");
    expect((await postAdmin("quelquun@exemple.test")).status).toBe(404);
  });

  // La page d'un autre site pourrait poster ce formulaire : sans cookie
  // (SameSite=Lax) elle n'aurait aucun droit, mais le contrôle d'origine fait
  // une défense de plus, comme pour l'envoi d'un import.
  it("refuse un envoi venu d'un autre site", async () => {
    jouer("admin");
    expect(
      (await postAdmin("quelquun@exemple.test", { origin: "https://autre.exemple.test", host: "appli.exemple.test" }))
        .status
    ).toBe(403);
  });

  // Essai du 2026-11-13 : dans GitHub Codespaces, le proxy transmet l'origine
  // localhost:3000 et l'hôte redirigé en x-forwarded-host ; l'export était
  // refusé. L'exception ne vaut que là, hors production.
  it("accepte, dans un Codespace hors production, l'origine localhost:3000 que transmet son proxy, et la refuse ailleurs", async () => {
    jouer("admin");
    const enTetes = { origin: "http://localhost:3000", "x-forwarded-host": "essai-abc123-3000.app.github.dev" };
    try {
      vi.stubEnv("CODESPACE_NAME", "essai-abc123");
      vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev");
      vi.stubEnv("NODE_ENV", "development");
      expect((await postAdmin("quelquun@exemple.test", enTetes)).status).toBe(200);
      vi.stubEnv("NODE_ENV", "production");
      expect((await postAdmin("quelquun@exemple.test", enTetes)).status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await postAdmin("quelquun@exemple.test", enTetes)).status).toBe(403);
  });

  it("refuse une adresse vide ou illisible", async () => {
    jouer("admin");
    expect((await postAdmin("   ")).status).toBe(400);
    expect((await postAdmin("pas-une-adresse")).status).toBe(400);
  });

  // L'adresse ne passe que dans le corps : une route GET la mettrait dans l'URL.
  it("n'a pas de GET", () => {
    expect("GET" in routeAdmin).toBe(false);
  });

  // Brique journal : l'export de l'admin se trace, au nom de l'admin, sur le
  // compte exporté désigné par son numéro, jamais par son adresse.
  it("trace l'export au journal, au nom de l'admin : « compte n°<id> »", async () => {
    jouer("admin");
    const admin = UTILISATEURS_DEMO.admin;
    const EXPORTEE = "personne.exportee@exemple.test";
    await query(`INSERT INTO utilisateurs (email, role) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`, [
      admin.email,
      admin.role,
    ]);
    const [{ id }] = await query<{ id: number }>(
      `INSERT INTO utilisateurs (email, role) VALUES ($1, 'membre') RETURNING id`,
      [EXPORTEE]
    );
    try {
      expect((await postAdmin(EXPORTEE)).status).toBe(200);
      expect(
        await query(
          `SELECT u.email AS auteur, j.action, j.libelle FROM journal_audit j JOIN utilisateurs u ON u.id = j.utilisateur_id
            WHERE j.entite = 'compte' AND j.entite_id = $1`,
          [String(id)]
        )
      ).toEqual([{ auteur: admin.email, action: "export", libelle: `compte n°${id}` }]);
    } finally {
      await query(`DELETE FROM journal_audit WHERE entite = 'compte' AND entite_id = $1`, [String(id)]);
      await query(`DELETE FROM utilisateurs WHERE id = $1`, [id]);
    }
  });
  // Fin de la brique journal.
});

/*
 * L'effacement, geste de l'admin seul, en deux temps : l'aperçu, puis la
 * confirmation, où l'admin retape l'adresse. Les règles (dernier admin, ses
 * propres données) sont dans tests/rgpd-effacement.test.ts.
 */
describe("effacement par l'admin", () => {
  const ELLE = "personne.a.effacer@exemple.test";
  const UN_404 = { digest: expect.stringContaining("404") };

  async function nettoyer() {
    const comptes = await query<{ id: number }>(
      `SELECT id FROM utilisateurs WHERE email = $1 OR email LIKE 'efface-%@efface.invalid'`,
      [ELLE]
    );
    const ids = comptes.map((compte) => compte.id);
    // Brique journal : la trace d'un effacement retient le compte (clé étrangère).
    await query(`DELETE FROM journal_audit WHERE entite = 'compte' AND entite_id = ANY($1::text[])`, [ids.map(String)]);
    // Fin de la brique journal.
    await query(`DELETE FROM utilisateurs WHERE id = ANY($1::int[])`, [ids]);
  }

  // L'admin joué a son compte en base, comme en vrai où la connexion le crée :
  // avec la brique journal, il est l'auteur de la trace. Un fichier qui vide
  // les comptes a pu passer avant celui-ci.
  beforeEach(async () => {
    await nettoyer();
    const admin = UTILISATEURS_DEMO.admin;
    await query(`INSERT INTO utilisateurs (email, role) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`, [
      admin.email,
      admin.role,
    ]);
  });
  afterEach(nettoyer);

  it("est réservé à l'admin dans les droits du catalogue", () => {
    expect(DROITS["donnees.effacer"]).toEqual(["admin"]);
  });

  it("répond 404 à un membre, à l'aperçu comme à l'effacement", async () => {
    jouer("membre");
    await expect(apercevoirEffacementAction(ELLE)).rejects.toMatchObject(UN_404);
    await expect(effacerAction(ELLE, ELLE)).rejects.toMatchObject(UN_404);
  });

  it("refuse l'aperçu et l'effacement sans connexion récente, en disant de se reconnecter et en le proposant, et n'efface rien : un cookie volé n'efface personne (audit du 2026-11-09)", async () => {
    jouer("admin");
    await query(`INSERT INTO utilisateurs (email, role) VALUES ($1, 'membre')`, [ELLE]);
    jouerLaConnexion("ancienne");
    const refus = {
      erreur: expect.stringMatching(/reconnectez-vous/),
      reconnexion: "/donnees-personnelles",
    };
    expect(await apercevoirEffacementAction(ELLE)).toEqual(refus);
    expect(await effacerAction(ELLE, ELLE)).toEqual(refus);
    expect(await query(`SELECT 1 FROM utilisateurs WHERE email = $1`, [ELLE])).toHaveLength(1);
  });

  it("refuse une adresse illisible", async () => {
    jouer("admin");
    expect(await apercevoirEffacementAction("pas-une-adresse")).toEqual({ erreur: expect.any(String) });
    expect(await effacerAction(42, 42)).toEqual({ erreur: expect.any(String) });
  });

  // Le geste ne se rattrape pas : l'adresse retapée doit être la même que
  // celle de l'aperçu, sinon rien ne s'efface.
  it("refuse une confirmation qui ne redit pas l'adresse, et n'efface rien", async () => {
    jouer("admin");
    await query(`INSERT INTO utilisateurs (email, role) VALUES ($1, 'membre')`, [ELLE]);

    expect(await effacerAction(ELLE, "autre@exemple.test")).toEqual({ erreur: expect.stringMatching(/retapée/) });
    expect(await query(`SELECT 1 FROM utilisateurs WHERE email = $1`, [ELLE])).toHaveLength(1);
  });

  it("efface après la confirmation, l'adresse retapée en majuscules ou avec des espaces", async () => {
    jouer("admin");
    await query(`INSERT INTO utilisateurs (email, role) VALUES ($1, 'membre')`, [ELLE]);

    const apercu = await apercevoirEffacementAction(ELLE);
    expect(apercu).toMatchObject({ bilan: { effectue: false } });

    const issue = await effacerAction(ELLE, ` ${ELLE.toUpperCase()} `);
    expect(issue).toMatchObject({ bilan: { effectue: true } });
    expect(await query(`SELECT 1 FROM utilisateurs WHERE email = $1`, [ELLE])).toEqual([]);
  });

  // Brique journal : l'anonymisation du compte se trace comme les autres
  // gestes de l'administration des comptes, au nom de l'admin, sans l'adresse.
  it("trace l'effacement du compte au journal, au nom de l'admin : « compte n°<id> »", async () => {
    jouer("admin");
    const [{ id }] = await query<{ id: number }>(
      `INSERT INTO utilisateurs (email, role) VALUES ($1, 'membre') RETURNING id`,
      [ELLE]
    );

    await effacerAction(ELLE, ELLE);

    expect(
      await query(
        `SELECT u.email AS auteur, j.action, j.libelle FROM journal_audit j JOIN utilisateurs u ON u.id = j.utilisateur_id
          WHERE j.entite = 'compte' AND j.entite_id = $1`,
        [String(id)]
      )
    ).toEqual([{ auteur: UTILISATEURS_DEMO.admin.email, action: "modification", libelle: `compte n°${id}` }]);
  });
  // Fin de la brique journal.
});
