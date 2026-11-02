import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { query } from "../src/lib/db/client";
import { creerDossier, modifierDossier, supprimerDossiers, type ChampsDossier } from "../src/lib/db/dossiers";
import { lireJournal } from "../src/briques/journal/journal";
import { UTILISATEURS_DEMO } from "../src/briques/comptes/demo";
import { jouer } from "./aide-session";

// Le branchement du journal sur le patron dossiers : le modèle que
// copie un module. Les références de ce fichier portent un préfixe ; chaque
// test efface ses dossiers et leurs lignes du journal (voir journal.test.ts).
const PREFIXE = "TEST-JOURNAL-";

const champs = (reference: string, modifications: Partial<ChampsDossier> = {}): ChampsDossier => ({
  reference: `${PREFIXE}${reference}`,
  client: "Client fictif",
  montant_centimes: 100_000,
  statut: "en_cours",
  echeance: null,
  notes: null,
  ...modifications,
});

const lignesDuTest = async () =>
  (await lireJournal({ entite: "dossiers" })).filter((ligne) => ligne.libelle.startsWith(PREFIXE));

beforeAll(async () => {
  for (const { email, role } of Object.values(UTILISATEURS_DEMO)) {
    await query("INSERT INTO utilisateurs (email, role) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING", [email, role]);
  }
});

afterEach(async () => {
  await query("DELETE FROM journal_audit WHERE entite = 'dossiers' AND libelle LIKE $1", [`${PREFIXE}%`]);
  await query("DELETE FROM dossiers WHERE reference LIKE $1", [`${PREFIXE}%`]);
});

describe("journal des dossiers", () => {
  it("trace la création, la modification et la suppression d'un dossier, avec son auteur et sa référence", async () => {
    jouer("admin");
    const dossier = await creerDossier(champs("1"));
    await modifierDossier(dossier.id, champs("1", { client: "Autre client", statut: "gagne" }));
    await supprimerDossiers([dossier.id]);
    const lignes = await lignesDuTest();
    expect(
      lignes.map(({ action, entite_id, libelle, champs, auteur }) => ({ action, entite_id, libelle, champs, auteur }))
    ).toEqual([
      {
        action: "suppression",
        entite_id: String(dossier.id),
        libelle: `${PREFIXE}1`,
        champs: [],
        auteur: UTILISATEURS_DEMO.admin.email,
      },
      {
        action: "modification",
        entite_id: String(dossier.id),
        libelle: `${PREFIXE}1`,
        champs: ["client", "statut"],
        auteur: UTILISATEURS_DEMO.admin.email,
      },
      {
        action: "creation",
        entite_id: String(dossier.id),
        libelle: `${PREFIXE}1`,
        champs: [],
        auteur: UTILISATEURS_DEMO.admin.email,
      },
    ]);
  });

  it("une suppression en lot laisse une ligne par dossier, et la référence d'un dossier supprimé reste lisible", async () => {
    const a = await creerDossier(champs("A"));
    const b = await creerDossier(champs("B"));
    await supprimerDossiers([a.id, b.id]);
    const suppressions = (await lignesDuTest()).filter((ligne) => ligne.action === "suppression");
    expect(suppressions.map((ligne) => ligne.libelle).sort()).toEqual([`${PREFIXE}A`, `${PREFIXE}B`]);
  });

  it("n'écrit pas de ligne pour un dossier enregistré sans changement", async () => {
    const dossier = await creerDossier(champs("2"));
    await modifierDossier(dossier.id, champs("2"));
    expect((await lignesDuTest()).map((ligne) => ligne.action)).toEqual(["creation"]);
  });

  it("sans personne connectée, ne crée, ne modifie ni ne supprime rien : aucune écriture sans auteur", async () => {
    const dossier = await creerDossier(champs("3"));
    jouer(null);
    await expect(creerDossier(champs("4"))).rejects.toThrow();
    await expect(modifierDossier(dossier.id, champs("3", { client: "Autre" }))).rejects.toThrow();
    await expect(supprimerDossiers([dossier.id])).rejects.toThrow();
    const restants = await query<{ reference: string; client: string }>(
      "SELECT reference, client FROM dossiers WHERE reference LIKE $1",
      [`${PREFIXE}%`]
    );
    expect(restants).toEqual([{ reference: `${PREFIXE}3`, client: "Client fictif" }]);
  });
});
