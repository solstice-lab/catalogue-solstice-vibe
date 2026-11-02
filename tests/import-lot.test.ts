import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { query, queryOne, transaction } from "../src/lib/db/client";
import type { Branchement, ValeursLigne } from "../src/briques/import-lot/branchement";
import { SOURCES_IMPORT_LOT } from "../src/briques/import-lot/donnees-personnelles";
import {
  confirmerLot,
  creerLot,
  champsDeDecisionVides,
  ErreurLot,
  ignorerLot,
  lireLot,
  renseignerDecision,
  supprimerLot,
} from "../src/briques/import-lot/lot";

// La base de test est partagée : table cible et lots propres à ce fichier,
// nettoyés après chaque test.
const PREFIXE = "test-import-lot";

beforeAll(async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS test_import_cible (
      reference TEXT PRIMARY KEY,
      fournisseur TEXT,
      montant NUMERIC,
      paye TEXT,
      renvoi_de TEXT REFERENCES test_import_cible (reference)
    )
  `);
});

afterEach(async () => {
  await query(`DELETE FROM import_lots WHERE branchement LIKE $1`, [`${PREFIXE}%`]);
  await query(`UPDATE test_import_cible SET renvoi_de = NULL`);
  await query(`DELETE FROM test_import_cible`);
});

afterAll(async () => {
  await query(`DROP TABLE IF EXISTS test_import_cible`);
});

async function fichier(entetes: string[], lignes: unknown[][]): Promise<Uint8Array> {
  const livre = new ExcelJS.Workbook();
  const feuille = livre.addWorksheet("Contrats");
  feuille.addRow(entetes);
  for (const ligne of lignes) feuille.addRow(ligne);
  return new Uint8Array(await livre.xlsx.writeBuffer());
}

// Mise à jour en place, comme le ferait une fonction de src/lib/db/ de l'appli.
async function ecrireCible(client: { query: typeof query }, valeurs: ValeursLigne): Promise<"cree" | "mis_a_jour"> {
  const lignes = await client.query<{ cree: boolean }>(
    `INSERT INTO test_import_cible (reference, fournisseur, montant, paye, renvoi_de)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (reference) DO UPDATE
       SET fournisseur = EXCLUDED.fournisseur, montant = EXCLUDED.montant, paye = EXCLUDED.paye, renvoi_de = EXCLUDED.renvoi_de
     RETURNING (xmax = 0) AS cree`,
    [valeurs.reference, valeurs.fournisseur, valeurs.montant, valeurs.paye, valeurs.renvoi_de]
  );
  return lignes[0].cree ? "cree" : "mis_a_jour";
}

function branchement(suffixe: string, surcharge: Partial<Branchement> = {}): Branchement {
  return {
    id: `${PREFIXE}-${suffixe}`,
    champs: [
      { champ: "reference", entetes: ["Référence"], type: "texte", obligatoire: true },
      { champ: "fournisseur", entetes: ["Fournisseur"], type: "texte" },
      { champ: "montant", entetes: ["Montant"], type: "nombre" },
      { champ: "paye", entetes: ["Payé"], type: "texte" },
      { champ: "renvoi_de", entetes: ["Renvoi de"], type: "texte" },
    ],
    cle: ["reference"],
    formatDate: "jour_mois",
    mode: "mise_a_jour",
    ecrire: ecrireCible,
    ...surcharge,
  };
}

const ENTETES = ["Référence", "Fournisseur", "Montant", "Payé", "Renvoi de"];

async function lignesCible(): Promise<{ reference: string; montant: string | null }[]> {
  return query(`SELECT reference, montant::text AS montant FROM test_import_cible ORDER BY reference`);
}

describe("lot d'import : création, confirmation, abandon", () => {
  it("créer un lot n'écrit rien dans l'entité cible, et les lignes écartées gardent leur numéro (projet précédent : tout le fichier est validé avant la première écriture)", async () => {
    const b = branchement("creation");
    const octets = await fichier(ENTETES, [
      ["C1", "Atelier Morvan", 100, null, null],
      ["C2", "Atelier Morvan", "douze", null, null],
    ]);
    const lot = await creerLot(b, "contrats.xlsx", octets);
    expect(lot.ecartees).toEqual([{ numero: 3, motif: "Montant : « douze » n'est pas un nombre" }]);
    expect(await lignesCible()).toEqual([]);
    const lu = await lireLot(lot.id, b.id);
    expect(lu?.statut).toBe("en_attente");
    expect(lu?.lignes.map((l) => l.numero)).toEqual([2]);
  });

  it("`ecarter` écarte à la lecture, avec son motif et tous les numéros de la ligne fusionnée ; les autres lignes restent confirmables et l'écartée ne s'écrit pas (relevé en recette)", async () => {
    const vues: string[] = [];
    const b = branchement("ecarter", {
      ecarter: async (valeurs) => {
        vues.push(String(valeurs.reference));
        return valeurs.reference === "C2" ? "Commande C2 : refusée à la lecture." : null;
      },
    });
    const octets = await fichier(ENTETES, [
      ["C1", "Atelier Morvan", 100, null, null],
      ["C2", "Atelier Morvan", 200, null, null],
      ["C3", "Atelier Morvan", "douze", null, null],
      ["c2 ", "Atelier Morvan", 200, null, null],
    ]);
    const lot = await creerLot(b, "contrats.xlsx", octets);

    // Une seule question par ligne retenue (C3, mal typée, n'en pose pas) ; la ligne fusionnée de C2 porte ses deux numéros.
    expect(vues).toEqual(["C1", "C2"]);
    expect(lot.ecartees).toEqual([
      { numero: 3, motif: "Commande C2 : refusée à la lecture." },
      { numero: 4, motif: "Montant : « douze » n'est pas un nombre" },
      { numero: 5, motif: "Commande C2 : refusée à la lecture." },
    ]);
    expect(lot.lignes.map((ligne) => ligne.valeurs.reference)).toEqual(["C1"]);
    // La fusion de C2 avec « c2 » ne reste pas au rapport d'une ligne qui n'est pas écrite.
    expect(lot.fusions).toEqual([]);

    await confirmerLot(b, lot.id);
    expect((await lignesCible()).map((ligne) => ligne.reference)).toEqual(["C1"]);
  });

  it("un fichier dont une colonne obligatoire manque est refusé d'emblée, sans créer de lot", async () => {
    const b = branchement("colonne");
    const octets = await fichier(["Fournisseur"], [["Atelier Morvan"]]);
    await expect(creerLot(b, "contrats.xlsx", octets)).rejects.toThrow(/Référence/);
    const lots = await query(`SELECT id FROM import_lots WHERE branchement = $1`, [b.id]);
    expect(lots).toEqual([]);
  });

  it("un lot de plusieurs centaines de lignes se confirme sans erreur (une appli livrée : une erreur brute dès ~90 lignes)", async () => {
    const b = branchement("gros");
    const lignes = Array.from({ length: 1500 }, (_, i) => [`G${String(i).padStart(4, "0")}`, "Atelier", i, null, null]);
    const lot = await creerLot(b, "gros.xlsx", await fichier(ENTETES, lignes));
    const resultat = await confirmerLot(b, lot.id);
    expect(resultat.rapport).toMatchObject({ creees: 1500, mises_a_jour: 0 });
    expect(await lignesCible()).toHaveLength(1500);
    // Délai explicite : la confirmation écrit une ligne par requête, donc la durée suit la
    // taille du lot. Mesuré le 2026-10-22 (poste Windows 4 cœurs, Postgres sous Docker Desktop, base
    // dédiée) : 1,2 à 1,6 s au repos (sept passages), 2,2 s sous 2 boucles CPU sur le poste, 2,3 s sous
    // 4 boucles CPU dans le conteneur Postgres. Sur un poste saturé (4 boucles sur 4 cœurs), le test a pris
    // 40 s et échoué : aucun délai ne protège de ce cas.
    // Un dépassement ne coupe pas le travail en cours : il pollue le nettoyage et fait échouer les tests suivants.
  }, 30_000);

  it("un lot au-delà de la limite de paramètres d'une requête (65 535) se crée : les lignes entrent en un seul paramètre JSON", async () => {
    const b = branchement("tres-gros");
    // 15 000 lignes x 5 colonnes = 75 000 valeurs : un paramètre par valeur dépasserait la limite de Postgres.
    const lignes = Array.from({ length: 15_000 }, (_, i) => [`T${i}`, "Atelier", i, null, null]);
    const lot = await creerLot(b, "tres-gros.xlsx", await fichier(ENTETES, lignes));
    expect(lot.lignes).toHaveLength(15_000);
  }, 120_000);

  it("un échec au milieu de la confirmation ne laisse aucun état partiel (une appli livrée)", async () => {
    let appels = 0;
    const b = branchement("echec", {
      ecrire: async (client, valeurs) => {
        appels += 1;
        if (appels === 4) throw new Error("boum");
        return ecrireCible(client, valeurs);
      },
    });
    const lignes = Array.from({ length: 6 }, (_, i) => [`E${i}`, "Atelier", i, null, null]);
    const lot = await creerLot(b, "echec.xlsx", await fichier(ENTETES, lignes));
    await expect(confirmerLot(b, lot.id)).rejects.toThrow("boum");
    expect(await lignesCible()).toEqual([]);
    expect((await lireLot(lot.id, b.id))?.statut).toBe("en_attente");
  });

  it("confirmer deux fois le même lot ne crée rien et ne plante pas (une appli livrée : une page périmée soumise deux fois)", async () => {
    const b = branchement("deux-fois");
    const lot = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["D1", "Atelier", 10, null, null]]));
    const premiere = await confirmerLot(b, lot.id);
    expect(premiere.dejaConfirme).toBe(false);
    const seconde = await confirmerLot(b, lot.id);
    expect(seconde.dejaConfirme).toBe(true);
    expect(seconde.rapport).toEqual(premiere.rapport);
    expect(await lignesCible()).toHaveLength(1);
  });

  it("deux confirmations simultanées du même lot n'écrivent qu'une fois", async () => {
    const b = branchement("simultanees");
    const lot = await creerLot(
      b,
      "c.xlsx",
      await fichier(ENTETES, [
        ["S1", "Atelier", 10, null, null],
        ["S2", "Atelier", 20, null, null],
      ])
    );
    const [a, c] = await Promise.all([confirmerLot(b, lot.id), confirmerLot(b, lot.id)]);
    expect([a.dejaConfirme, c.dejaConfirme].sort()).toEqual([false, true]);
    expect(await lignesCible()).toHaveLength(2);
  });

  it("un fichier se reconnaît à son contenu, pas à son nom : un CSV nommé .xlsx s'importe", async () => {
    const b = branchement("nom-trompeur");
    const csv = new TextEncoder().encode("Référence;Fournisseur;Montant\nT1;Atelier;12,5\n");
    const lot = await creerLot(b, "contrats.xlsx", csv);
    await confirmerLot(b, lot.id);
    expect(await lignesCible()).toEqual([{ reference: "T1", montant: "12.5" }]);
  });

  it("une décision saisie à la main se type comme une cellule du fichier, et ne se change plus une fois le lot traité", async () => {
    const b = branchement("decision-typee", {
      champs: branchement("x").champs.map((champ) =>
        champ.champ === "montant" ? { ...champ, decision: true } : champ
      ),
    });
    const lot = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["Q1", "Atelier", null, null, null]]));
    const ligne = (await lireLot(lot.id, b.id))!.lignes[0];
    await expect(renseignerDecision(b, lot.id, ligne.id, "montant", "beaucoup")).rejects.toBeInstanceOf(ErreurLot);
    await renseignerDecision(b, lot.id, ligne.id, "montant", "12,5");
    expect((await lireLot(lot.id, b.id))!.lignes[0].valeurs.montant).toBe(12.5);
    await confirmerLot(b, lot.id);
    await expect(renseignerDecision(b, lot.id, ligne.id, "montant", "99")).rejects.toBeInstanceOf(ErreurLot);
    expect(await lignesCible()).toEqual([{ reference: "Q1", montant: "12.5" }]);
  });

  it("ignorer deux fois le même lot ne plante pas", async () => {
    const b = branchement("ignore-deux-fois");
    const lot = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["J1", "Atelier", 1, null, null]]));
    await ignorerLot(lot.id, b.id);
    await expect(ignorerLot(lot.id, b.id)).resolves.toBeUndefined();
  });

  it("l'ordre d'écriture suit l'ordre des renvois même sur un lot de plusieurs centaines de lignes (chaîne inversée)", async () => {
    const b = branchement("chaine", { renvoi: { champ: "renvoi_de", cible: "reference" } });
    // L0 est la racine ; chaque ligne renvoie à la précédente, mais le fichier les liste à l'envers.
    const lignes = Array.from({ length: 300 }, (_, i) => [
      `L${i}`,
      "Atelier",
      i,
      null,
      i === 0 ? null : `L${i - 1}`,
    ]).reverse();
    const lot = await creerLot(b, "chaine.xlsx", await fichier(ENTETES, lignes));
    await expect(confirmerLot(b, lot.id)).resolves.toMatchObject({ rapport: { creees: 300 } });
    // Le rang d'écriture est porté par la colonne `ordre`, pas par l'ordre des identifiants.
    const rangs = await query<{ reference: string }>(
      `SELECT valeurs->>'reference' AS reference FROM import_lot_lignes WHERE lot_id = $1 ORDER BY ordre LIMIT 3`,
      [lot.id]
    );
    expect(rangs.map((r) => r.reference)).toEqual(["L0", "L1", "L2"]);
  });

  it("un lot d'une autre entité ne se lit, ne s'ignore ni ne se supprime avec le branchement d'une autre : un identifiant posté à la main n'ouvre rien", async () => {
    const b = branchement("proprietaire");
    const autre = branchement("intrus");
    const lot = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["W1", "Atelier", 1, null, null]]));
    expect(await lireLot(lot.id, autre.id)).toBeNull();
    await expect(ignorerLot(lot.id, autre.id)).rejects.toBeInstanceOf(ErreurLot);
    await supprimerLot(lot.id, autre.id);
    expect((await lireLot(lot.id, b.id))?.statut).toBe("en_attente");
  });

  it("un lot ignoré ne s'écrit jamais, et un lot confirmé ne s'ignore plus", async () => {
    const b = branchement("ignore");
    const lot = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["I1", "Atelier", 10, null, null]]));
    await ignorerLot(lot.id, b.id);
    expect((await lireLot(lot.id, b.id))?.statut).toBe("ignore");
    await expect(confirmerLot(b, lot.id)).rejects.toBeInstanceOf(ErreurLot);
    expect(await lignesCible()).toEqual([]);

    const autre = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["I2", "Atelier", 10, null, null]]));
    await confirmerLot(b, autre.id);
    await expect(ignorerLot(autre.id, b.id)).rejects.toBeInstanceOf(ErreurLot);
  });

  it("un lot sans aucune ligne retenue ne se confirme pas : il s'ignore (une appli livrée : un lot entièrement rejeté s'affichait « Confirmé »)", async () => {
    const b = branchement("vide");
    const lot = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["V1", "Atelier", "abc", null, null]]));
    await expect(confirmerLot(b, lot.id)).rejects.toThrow(/aucune ligne/i);
    expect((await lireLot(lot.id, b.id))?.statut).toBe("en_attente");
  });

  it("supprimer un lot ne touche aucune ligne d'un autre lot, ni l'entité (une appli livrée : la suppression d'un lot « Doublon » effaçait les publications d'un autre)", async () => {
    const b = branchement("suppression");
    const premier = await creerLot(b, "mars.xlsx", await fichier(ENTETES, [["X1", "Atelier", 10, null, null]]));
    await confirmerLot(b, premier.id);
    const second = await creerLot(
      b,
      "avril.xlsx",
      await fichier(ENTETES, [
        ["X1", "Atelier", 12, null, null],
        ["X2", "Atelier", 5, null, null],
      ])
    );
    await confirmerLot(b, second.id);

    await supprimerLot(premier.id, b.id);

    expect(await lireLot(premier.id, b.id)).toBeNull();
    expect((await lireLot(second.id, b.id))?.lignes).toHaveLength(2);
    expect(await lignesCible()).toEqual([
      { reference: "X1", montant: "12" },
      { reference: "X2", montant: "5" },
    ]);
  });

  it("un réimport met à jour en place et garde la trace du lot précédent (une appli livrée : les deux traces restent consultables)", async () => {
    const b = branchement("reimport");
    const premier = await creerLot(b, "mars.xlsx", await fichier(ENTETES, [["R1", "Atelier", 10, null, null]]));
    await confirmerLot(b, premier.id);
    const second = await creerLot(b, "mars-corrige.xlsx", await fichier(ENTETES, [["R1", "Atelier", 15, null, null]]));
    const resultat = await confirmerLot(b, second.id);

    expect(resultat.rapport).toMatchObject({ creees: 0, mises_a_jour: 1 });
    expect(await lignesCible()).toEqual([{ reference: "R1", montant: "15" }]);
    // La trace du premier lot garde ce qu'il avait lu.
    const trace = await lireLot(premier.id, b.id);
    expect(trace?.statut).toBe("confirme");
    expect(trace?.lignes[0].valeurs.montant).toBe(10);
  });

  it("un champ de décision vide bloque la confirmation, jamais rempli par défaut (une appli livrée : « payant / non payant »)", async () => {
    const b = branchement("decision", {
      champs: branchement("x").champs.map((champ) => (champ.champ === "paye" ? { ...champ, decision: true } : champ)),
    });
    const lot = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["P1", "Atelier", 10, null, null]]));
    const erreur = await confirmerLot(b, lot.id).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurLot);
    expect((erreur as ErreurLot).message).toMatch(/Payé/);
    expect((erreur as ErreurLot).message).toMatch(/ligne 2/);
    expect(await lignesCible()).toEqual([]);

    const ligne = (await lireLot(lot.id, b.id))!.lignes[0];
    expect(champsDeDecisionVides(ligne.valeurs, b)).toEqual(["paye"]);
    await renseignerDecision(b, lot.id, ligne.id, "paye", "Non payant");
    await confirmerLot(b, lot.id);
    const ecrit = await query<{ paye: string }>(`SELECT paye FROM test_import_cible WHERE reference = 'P1'`);
    expect(ecrit[0].paye).toBe("Non payant");
  });

  it("une valeur de décision vide ne vaut pas une décision", async () => {
    const b = branchement("decision-vide", {
      champs: branchement("x").champs.map((champ) => (champ.champ === "paye" ? { ...champ, decision: true } : champ)),
    });
    const lot = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["P2", "Atelier", 10, null, null]]));
    const ligne = (await lireLot(lot.id, b.id))!.lignes[0];
    await renseignerDecision(b, lot.id, ligne.id, "paye", "   ");
    await expect(confirmerLot(b, lot.id)).rejects.toBeInstanceOf(ErreurLot);
  });

  it("mode remplacement : la période est effacée seulement quand tout est prêt, puis réécrite dans la même transaction (projet précédent : un import destructif lit tout ou rien)", async () => {
    await query(`INSERT INTO test_import_cible (reference, montant) VALUES ('ANCIEN', 1)`);
    const journal: string[] = [];
    const b = branchement("remplacement", {
      mode: "remplacement",
      champs: branchement("x").champs.map((champ) => (champ.champ === "paye" ? { ...champ, decision: true } : champ)),
      remplacer: async (client) => {
        journal.push("remplacer");
        await client.query(`DELETE FROM test_import_cible`);
      },
      ecrire: async (client, valeurs) => {
        journal.push(`ecrire ${valeurs.reference}`);
        return ecrireCible(client, valeurs);
      },
    });
    const lot = await creerLot(
      b,
      "c.xlsx",
      await fichier(ENTETES, [
        ["N1", "Atelier", 10, null, null],
        ["N2", "Atelier", 20, null, null],
      ])
    );

    // Décisions manquantes : rien n'est effacé.
    await expect(confirmerLot(b, lot.id)).rejects.toBeInstanceOf(ErreurLot);
    expect(journal).toEqual([]);
    expect(await lignesCible()).toEqual([{ reference: "ANCIEN", montant: "1" }]);

    for (const ligne of (await lireLot(lot.id, b.id))!.lignes)
      await renseignerDecision(b, lot.id, ligne.id, "paye", "Oui");
    await confirmerLot(b, lot.id);
    expect(journal).toEqual(["remplacer", "ecrire N1", "ecrire N2"]);
    expect((await lignesCible()).map((l) => l.reference)).toEqual(["N1", "N2"]);
  });

  it("une écriture qui échoue après le remplacement restitue la période effacée", async () => {
    await query(`INSERT INTO test_import_cible (reference, montant) VALUES ('ANCIEN', 1)`);
    const b = branchement("remplacement-echec", {
      mode: "remplacement",
      remplacer: async (client) => {
        await client.query(`DELETE FROM test_import_cible`);
      },
      ecrire: async () => {
        throw new Error("boum");
      },
    });
    const lot = await creerLot(b, "c.xlsx", await fichier(ENTETES, [["N1", "Atelier", 10, null, null]]));
    await expect(confirmerLot(b, lot.id)).rejects.toThrow("boum");
    expect(await lignesCible()).toEqual([{ reference: "ANCIEN", montant: "1" }]);
  });

  it("une ligne qui renvoie à une autre du même lot s'insère après elle : la clé étrangère de la base le vérifie (projet précédent)", async () => {
    const b = branchement("renvoi", { renvoi: { champ: "renvoi_de", cible: "reference" } });
    const lot = await creerLot(
      b,
      "campagnes.xlsx",
      await fichier(ENTETES, [
        ["RENVOI", "Atelier", 1, null, "ORIGINAL"],
        ["ORIGINAL", "Atelier", 2, null, null],
      ])
    );
    await expect(confirmerLot(b, lot.id)).resolves.toMatchObject({ rapport: { creees: 2 } });
  });

  it("deux clés que la normalisation rapproche s'écrivent une seule fois, fusionnées avant l'écriture", async () => {
    const b = branchement("fusion");
    const lot = await creerLot(
      b,
      "c.xlsx",
      await fichier(ENTETES, [
        ["AB13", "Atelier", null, null, null],
        ["AB 13", null, 40, null, null],
      ])
    );
    expect(lot.fusions).toEqual([{ cle: "ab13", numeros: [2, 3], conflits: [] }]);
    await confirmerLot(b, lot.id);
    expect(await lignesCible()).toEqual([{ reference: "AB13", montant: "40" }]);
  });

  it("un lot d'un autre branchement ne se confirme pas avec celui-ci : il écrirait dans la mauvaise entité", async () => {
    const lot = await creerLot(branchement("a"), "c.xlsx", await fichier(ENTETES, [["Z1", "Atelier", 1, null, null]]));
    await expect(confirmerLot(branchement("b"), lot.id)).rejects.toBeInstanceOf(ErreurLot);
  });

  it("un fichier illisible ne crée pas de lot", async () => {
    const b = branchement("illisible");
    await expect(creerLot(b, "c.xlsx", Uint8Array.from([0, 1, 2, 0xff]))).rejects.toThrow(/format/i);
    expect(await query(`SELECT id FROM import_lots WHERE branchement = $1`, [b.id])).toEqual([]);
  });
});

// La source « lignes-importees » de l'effacement des données d'une personne
// (brique rgpd). La ligne d'un fichier importé reste, pour l'histoire du lot ;
// l'adresse n'y est plus, cherchée comme une valeur entière, comme à l'export.
describe("effacement des données d'une personne dans les lignes importées", () => {
  it("remplace l'adresse dans les valeurs des lignes où elle figure, et rien d'autre", async () => {
    // Un « + » et des points : lus comme une expression régulière, ils
    // laissaient l'adresse en place et touchaient une adresse voisine.
    const ELLE = "contact.efface+rgpd@exemple.test";
    const VOISINE = "contactXefface+rgpd@exemple.test";
    const lot = await queryOne<{ id: number }>(
      `INSERT INTO import_lots (branchement, nom_fichier) VALUES ($1, 'effacement.csv') RETURNING id`,
      [`${PREFIXE}-effacement`]
    );
    await query(
      `INSERT INTO import_lot_lignes (lot_id, ordre, numero, numeros, valeurs)
       VALUES ($1, 1, 2, '{2}', $2::jsonb), ($1, 2, 3, '{3}', $3::jsonb)`,
      [
        lot!.id,
        JSON.stringify({ contact: ELLE.toUpperCase(), copie: VOISINE, nom: "Fournisseur A" }),
        JSON.stringify({ contact: "autre@exemple.test", nom: "Fournisseur B" }),
      ]
    );

    const issue = await transaction((tx) => SOURCES_IMPORT_LOT[0].effacer(tx, ELLE));

    expect(issue).toEqual({ lignes: 1 });
    expect(
      (await query(`SELECT valeurs FROM import_lot_lignes WHERE lot_id = $1 ORDER BY ordre`, [lot!.id])).map(
        (ligne) => ligne.valeurs
      )
    ).toEqual([
      { contact: "(adresse effacée)", copie: VOISINE, nom: "Fournisseur A" },
      { contact: "autre@exemple.test", nom: "Fournisseur B" },
    ]);
  });
});
