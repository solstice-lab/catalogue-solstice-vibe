import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Branchement } from "../src/briques/echeances/branchement";
import { query } from "../src/lib/db/client";
import { lireEcheances } from "../src/briques/echeances/requete";

/*
 * Les gardes de lecture de la brique échéances (src/briques/echeances/requete.ts).
 * Ils étaient verrouillés par
 * le test du premier module de test du catalogue, qui partait avec lui quand
 * une copie client le retirait : plus rien ne les couvrait alors. Un
 * branchement local au test, sur une table que le test crée et supprime
 * lui-même, les fait vivre sans aucun module métier, et
 * au remplacement du module d'exemple dossiers par les écrans du client.
 */
const AUJOURDHUI = "2026-10-14";

type LigneTest = { id: number; reference: string };

const TABLE = "test_echeances_requete";

// Une colonne de type date et une de type timestamptz : de quoi faire passer
// la garde et la faire refuser.
beforeAll(async () => {
  await query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    id SERIAL PRIMARY KEY,
    reference TEXT NOT NULL DEFAULT 'x',
    echeance DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
});

afterAll(async () => {
  await query(`DROP TABLE IF EXISTS ${TABLE}`);
});

const BRANCHEMENT_TEST: Branchement<LigneTest> = {
  id: "echeances-requete-test",
  table: TABLE,
  colonneDate: "echeance",
  colonnes: ["id", "reference"],
  delaiAlerteJours: 30,
  intitules: { entite: "Ligne", date: "Échéance" },
  libelle: (ligne) => ligne.reference,
  lien: (ligne) => `/lignes/${ligne.id}`,
};

describe("brique échéances : gardes de lecture", () => {
  it("refuse un branchement dont la table ou une colonne n'est pas un identifiant simple : ces noms entrent tels quels dans le SQL", async () => {
    await expect(
      lireEcheances({ ...BRANCHEMENT_TEST, table: `${TABLE}; DROP TABLE ${TABLE}` }, AUJOURDHUI)
    ).rejects.toThrow(/identifiant/);
    await expect(lireEcheances({ ...BRANCHEMENT_TEST, colonneDate: "echeance) OR (1=1" }, AUJOURDHUI)).rejects.toThrow(
      /identifiant/
    );
  });

  it("refuse une colonne d'échéance qui n'est pas de type date : un timestamptz se ramènerait au jour dans le fuseau de la base, pas celui du client", async () => {
    await expect(lireEcheances({ ...BRANCHEMENT_TEST, colonneDate: "created_at" }, AUJOURDHUI)).rejects.toThrow(
      /type date/
    );
  });

  it("lit une colonne de type date sans erreur (le cas sain des deux refus ci-dessus)", async () => {
    await expect(lireEcheances(BRANCHEMENT_TEST, AUJOURDHUI)).resolves.toBeInstanceOf(Array);
  });
});
