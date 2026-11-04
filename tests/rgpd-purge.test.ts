import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query, transaction } from "../src/lib/db/client";
import { CONFIDENTIALITE, conservations, dureesInconnues, type ConservationLue } from "../src/lib/confidentialite";
import { MENTIONS_LEGALES } from "../src/lib/mentions-legales";
import { apercevoirPurge, CLE_VERROU_PURGE, purger, purgerAuPassage } from "../src/briques/rgpd/purge";

/*
 * La purge des données au terme de leur durée de conservation (brique rgpd).
 * Chaque brique déclare la durée de ses données à côté de la description de
 * ses traitements (son confidentialite.ts) ; la purge les lit, comme la
 * politique de confidentialité. Le script (scripts/purger-donnees.ts) en fait
 * un dry-run par défaut ; une appli sans tâche planifiée purge au passage
 * (tours-de-coloc : ses tours de plus de 12 mois partaient « au passage », et
 * la purge avait pris un ticket entier).
 *
 * Les cas tournent sur codes_connexion et utilisateurs : la brique comptes,
 * que la brique rgpd exige, est là dans toute appli qui garde ce fichier.
 */

const MARQUE = "test-rgpd-purge";
const ANCIENNE_ADRESSE = "ancien.compte.purge@exemple.test";

// Des conservations choisies par le test, jamais celles de l'appli : un projet
// client règle les siennes, et ce test doit rester vert après.
const CODES: ConservationLue = {
  cle: "essai-codes",
  traitement: "Traitement d'essai",
  donnee: "Demandes de code d'essai",
  duree: { heures: 1 },
  depart: "après la demande",
  purge: { table: "codes_connexion", colonne: "cree_le", auPassage: true },
};
const ESSAIS: ConservationLue = {
  ...CODES,
  cle: "essai-essais",
  donnee: "Saisies fausses d'essai",
  purge: { table: "codes_connexion_essais", colonne: "cree_le" },
};
const COMPTES_INACTIFS: ConservationLue = {
  ...CODES,
  cle: "essai-comptes",
  donnee: "Comptes inactifs d'essai",
  duree: { mois: 24 },
  depart: "après la dernière connexion",
  purge: {
    table: "utilisateurs",
    colonne: "derniere_connexion",
    aLaMain: "Raison d'essai : un compte s'efface par l'effacement des données.",
  },
};
const HORS_BASE: ConservationLue = {
  ...CODES,
  cle: "essai-hors-base",
  donnee: "E-mails d'essai chez le prestataire",
  purge: { horsBase: "Raison d'essai : le prestataire les garde selon ses conditions." },
};

async function codeAge(heures: number): Promise<void> {
  await query(
    `INSERT INTO codes_connexion (adresse_empreinte, code_empreinte, cree_le, expire_le)
     VALUES ($1, $1, now() - make_interval(hours => $2), now())`,
    [MARQUE, heures]
  );
}

const codesRestants = async () =>
  Number(
    (await query<{ n: string }>(`SELECT count(*) AS n FROM codes_connexion WHERE adresse_empreinte = $1`, [MARQUE]))[0]
      .n
  );

async function nettoyer() {
  // Toute la table : une ligne vieille d'un autre fichier fausserait le compte.
  await query(`DELETE FROM codes_connexion`);
  await query(`DELETE FROM codes_connexion_essais`);
  await query(`DELETE FROM utilisateurs WHERE email = $1`, [ANCIENNE_ADRESSE]);
}

beforeEach(nettoyer);
afterEach(nettoyer);

describe("purge des données au terme de leur durée de conservation", () => {
  it("efface ce qui a passé sa durée et garde le reste (une durée déclarée, une purge qui la tient)", async () => {
    await codeAge(2);
    await codeAge(0);

    const bilan = await purger({ transaction, conservations: [CODES] });

    expect(bilan).toMatchObject({
      effectue: true,
      effacees: [{ cle: "essai-codes", table: "codes_connexion", lignes: 1 }],
    });
    expect(await codesRestants()).toBe(1);
  });

  it("l'aperçu compte ce qui serait effacé, sans rien effacer : c'est le rapport relu avant --confirmer", async () => {
    await codeAge(2);
    await codeAge(3);

    const apercu = await apercevoirPurge({ transaction, conservations: [CODES] });

    expect(apercu).toMatchObject({ effectue: false, effacees: [{ cle: "essai-codes", lignes: 2 }] });
    expect(await codesRestants()).toBe(2);
  });

  it("une durée déclarée sans purge possible est signalée, jamais ignorée : les lignes échues comptées, rien d'effacé", async () => {
    await query(
      `INSERT INTO utilisateurs (email, role, derniere_connexion) VALUES ($1, 'membre', now() - interval '25 months')`,
      [ANCIENNE_ADRESSE]
    );

    const bilan = await purger({ transaction, conservations: [COMPTES_INACTIFS, HORS_BASE] });

    expect(bilan).toMatchObject({
      effacees: [],
      aLaMain: [
        { cle: "essai-comptes", table: "utilisateurs", lignes: 1, raison: expect.stringMatching(/Raison d'essai/) },
      ],
      horsBase: [{ cle: "essai-hors-base", raison: expect.stringMatching(/Raison d'essai/) }],
    });
    expect(await query(`SELECT 1 FROM utilisateurs WHERE email = $1`, [ANCIENNE_ADRESSE])).toHaveLength(1);
  });

  it("au passage, ne purge que les données marquées auPassage : le reste attend le script tapé par un humain", async () => {
    await codeAge(2);
    await query(`INSERT INTO codes_connexion_essais (ip_empreinte, cree_le) VALUES ($1, now() - interval '2 hours')`, [
      MARQUE,
    ]);

    const bilan = await purgerAuPassage({ transaction, conservations: [CODES, ESSAIS, COMPTES_INACTIFS] });

    expect(bilan).toMatchObject({ effectue: true, effacees: [{ cle: "essai-codes", lignes: 1 }], aLaMain: [] });
    expect(await codesRestants()).toBe(0);
    expect(await query(`SELECT 1 FROM codes_connexion_essais WHERE ip_empreinte = $1`, [MARQUE])).toHaveLength(1);
  });

  // Deux requêtes simultanées ne jouent pas la purge deux fois : la seconde
  // trouve le verrou pris et passe son chemin, sans attendre ni lever.
  it("au passage, une purge déjà en cours ailleurs fait passer son chemin à la seconde, sans rien effacer", async () => {
    await codeAge(2);

    const pendant = await transaction(async (autre) => {
      await autre.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [CLE_VERROU_PURGE]);
      return purgerAuPassage({ transaction, conservations: [CODES] });
    });

    expect(pendant).toEqual({ occupee: true });
    expect(await codesRestants()).toBe(1);
  });

  it("rejouée, ne change plus rien (idempotente)", async () => {
    await codeAge(2);
    await purger({ transaction, conservations: [CODES] });
    expect(await purger({ transaction, conservations: [CODES] })).toMatchObject({ effacees: [{ lignes: 0 }] });
  });

  it("refuse une table ou une colonne qui n'est pas un identifiant simple, avant toute requête", async () => {
    const piege: ConservationLue = {
      ...CODES,
      purge: { table: "codes_connexion; DROP TABLE utilisateurs", colonne: "cree_le" },
    };
    await expect(purger({ transaction, conservations: [piege] })).rejects.toThrow(/identifiant/);
  });
});

describe("les durées déclarées par l'appli", () => {
  it("chaque purge déclarée vise une table et une colonne de date qui existent dans la base", async () => {
    const colonnes = await query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type IN ('timestamp with time zone', 'date')`
    );
    const connues = new Set(colonnes.map((colonne) => `${colonne.table_name}.${colonne.column_name}`));
    const declarees = conservations().flatMap(({ cle, purge }) =>
      "table" in purge ? [{ cle, colonne: `${purge.table}.${purge.colonne}` }] : []
    );

    expect(declarees.length).toBeGreaterThan(0);
    expect(declarees.filter(({ colonne }) => !connues.has(colonne))).toEqual([]);
  });

  // Une clé mal tapée dans CONFIDENTIALITE.durees laisserait la durée de la
  // brique s'appliquer sans que rien le dise.
  it("chaque durée surchargée par le projet désigne une conservation déclarée, et une clé inconnue est attrapée", () => {
    expect(dureesInconnues(MENTIONS_LEGALES, CONFIDENTIALITE)).toEqual([]);
    expect(dureesInconnues(MENTIONS_LEGALES, { ...CONFIDENTIALITE, durees: { "cle-mal-tapee": { mois: 1 } } })).toEqual(
      ["cle-mal-tapee"]
    );
  });
});

describe("le script de purge (scripts/purger-donnees.ts)", () => {
  // Lancé sans --confirmer, comme le premier passage que fait un humain. Le
  // test ne lance jamais l'écriture : la purge elle-même est vérifiée plus haut.
  it("en dry-run, nomme la base en première ligne, liste ce qu'il effacerait et n'efface rien", async () => {
    await codeAge(2);

    const lancement = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), path.join("scripts", "purger-donnees.ts")],
      { cwd: process.cwd(), encoding: "utf-8", env: process.env, timeout: 60_000 }
    );

    expect(lancement.stderr).toBe("");
    expect(lancement.status).toBe(0);
    const [premiere] = lancement.stdout.split("\n");
    expect(premiere).toMatch(/^Base : \S+ — DRY-RUN/);
    expect(lancement.stdout).toMatch(/rien n'a été effacé/);
    expect(await codesRestants()).toBe(1);
  }, 60_000);
});
