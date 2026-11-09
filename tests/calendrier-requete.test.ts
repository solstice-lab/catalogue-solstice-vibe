import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Branchement } from "../src/briques/calendrier/branchement";
import { query } from "../src/lib/db/client";
import { lireEvenements } from "../src/briques/calendrier/requete";

/*
 * La seule fonction SQL de la brique calendrier (src/briques/calendrier/requete.ts),
 * sans test jusqu'à l'audit du 2026-11-09 : seul son calcul pur l'était. Un
 * branchement local au test, sur une table que le test crée et supprime
 * lui-même, la fait vivre sans aucun module métier, comme pour la brique
 * échéances (tests/echeances-requete.test.ts).
 */

type LigneTest = { id: number; reference: string; realisee_le: string; equipement: string };

const TABLE = "test_calendrier_requete";

// Une colonne de type date et une de type timestamptz : de quoi faire passer
// la garde et la faire refuser.
beforeAll(async () => {
  await query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    id SERIAL PRIMARY KEY,
    reference TEXT NOT NULL,
    equipement TEXT NOT NULL DEFAULT 'chaudière',
    realisee_le DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
});

beforeEach(async () => {
  await query(`DELETE FROM ${TABLE}`);
});

afterAll(async () => {
  await query(`DROP TABLE IF EXISTS ${TABLE}`);
});

const BRANCHEMENT_TEST: Branchement<LigneTest> = {
  id: "calendrier-requete-test",
  table: TABLE,
  colonneDate: "realisee_le",
  colonnes: ["id", "reference", "realisee_le", "equipement"],
  intitules: { entites: "interventions", date: "Réalisée le", detail: "Équipement" },
  libelle: (ligne) => ligne.reference,
  detail: (ligne) => ligne.equipement,
  // La date entre dans le lien : elle doit arriver en texte « aaaa-mm-jj ».
  lien: (ligne) => `/interventions/${ligne.realisee_le}-${ligne.id}`,
};

async function inserer(reference: string, date: string | null): Promise<number> {
  const [ligne] = await query<{ id: number }>(
    `INSERT INTO ${TABLE} (reference, realisee_le) VALUES ($1, $2) RETURNING id`,
    [reference, date]
  );
  return ligne.id;
}

describe("brique calendrier : lecture des événements d'un mois", () => {
  it("lit le premier et le dernier jour du mois, rien avant ni après, ni une ligne sans date", async () => {
    await inserer("veille", "2026-09-30");
    await inserer("premier", "2026-10-01");
    await inserer("dernier", "2026-10-31");
    await inserer("lendemain", "2026-11-01");
    await inserer("sans date", null);
    const evenements = await lireEvenements(BRANCHEMENT_TEST, "2026-10");
    expect(evenements.map((evenement) => evenement.libelle)).toEqual(["premier", "dernier"]);
  });

  it("borne février à son vrai dernier jour, bissextile ou non (un 29 février 2027 n'existe pas)", async () => {
    await inserer("fin février 2027", "2027-02-28");
    await inserer("début mars 2027", "2027-03-01");
    await inserer("29 février 2028", "2028-02-29");
    expect((await lireEvenements(BRANCHEMENT_TEST, "2027-02")).map((e) => e.libelle)).toEqual(["fin février 2027"]);
    expect((await lireEvenements(BRANCHEMENT_TEST, "2028-02")).map((e) => e.libelle)).toEqual(["29 février 2028"]);
  });

  it("trie par date, puis par libellé à date égale, quel que soit l'ordre en base", async () => {
    await inserer("Zinc", "2026-10-05");
    await inserer("Bornes", "2026-10-12");
    await inserer("Alarme", "2026-10-05");
    const evenements = await lireEvenements(BRANCHEMENT_TEST, "2026-10");
    expect(evenements.map((evenement) => [evenement.date, evenement.libelle])).toEqual([
      ["2026-10-05", "Alarme"],
      ["2026-10-05", "Zinc"],
      ["2026-10-12", "Bornes"],
    ]);
  });

  it("rend la date en texte « aaaa-mm-jj », dans l'événement comme dans la ligne qui compose le lien (un objet Date donnait « Fri Oct 02 2026… » dans le slug)", async () => {
    const id = await inserer("Révision", "2026-10-02");
    const [evenement] = await lireEvenements(BRANCHEMENT_TEST, "2026-10");
    expect(evenement).toEqual({
      lien: `/interventions/2026-10-02-${id}`,
      libelle: "Révision",
      detail: "chaudière",
      date: "2026-10-02",
    });
  });

  it("donne un détail nul quand le branchement n'en déclare pas", async () => {
    await inserer("Révision", "2026-10-02");
    const [evenement] = await lireEvenements({ ...BRANCHEMENT_TEST, detail: undefined }, "2026-10");
    expect(evenement.detail).toBeNull();
  });

  it("rend une liste vide pour un mois sans événement", async () => {
    await inserer("Révision", "2026-10-02");
    await expect(lireEvenements(BRANCHEMENT_TEST, "2026-11")).resolves.toEqual([]);
  });
});

describe("brique calendrier : gardes de lecture", () => {
  it("refuse un branchement dont la table ou une colonne n'est pas un identifiant simple : ces noms entrent tels quels dans le SQL", async () => {
    await expect(
      lireEvenements({ ...BRANCHEMENT_TEST, table: `${TABLE}; DROP TABLE ${TABLE}` }, "2026-10")
    ).rejects.toThrow(/identifiant/);
    await expect(
      lireEvenements({ ...BRANCHEMENT_TEST, colonneDate: "realisee_le) OR (1=1" }, "2026-10")
    ).rejects.toThrow(/identifiant/);
    await expect(
      lireEvenements({ ...BRANCHEMENT_TEST, colonnes: ["id", 'reference", now() AS "x' as "reference"] }, "2026-10")
    ).rejects.toThrow(/identifiant/);
  });

  it("refuse une colonne de date qui n'est pas de type date : un timestamptz se ramènerait au jour dans le fuseau de la base, et l'événement tomberait dans la case de la veille", async () => {
    await expect(lireEvenements({ ...BRANCHEMENT_TEST, colonneDate: "created_at" }, "2026-10")).rejects.toThrow(
      /type date/
    );
    await expect(lireEvenements({ ...BRANCHEMENT_TEST, colonneDate: "inexistante" }, "2026-10")).rejects.toThrow(
      /colonne introuvable/
    );
  });
});
