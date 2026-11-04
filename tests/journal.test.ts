import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { query, queryOne, transaction } from "../src/lib/db/client";
import { ACTIONS_JOURNALISEES } from "../src/briques/journal/evenements";
import {
  auteurCourant,
  ErreurJournal,
  historiqueSiPermis,
  journaliser,
  lireJournal,
} from "../src/briques/journal/journal";
import { SOURCES_JOURNAL } from "../src/briques/journal/donnees-personnelles";
import { TRAITEMENTS_JOURNAL } from "../src/briques/journal/confidentialite";
import { purger } from "../src/briques/rgpd/purge";
import { conservations } from "../src/lib/confidentialite";
import { UTILISATEURS_DEMO } from "../src/briques/comptes/demo";
import { peut } from "../src/briques/comptes/roles";
import { jouer } from "./aide-session";

// Le journal en base réelle. L'auteur est la personne de la session
// (tests/setup.ts la joue) ; il doit exister dans utilisateurs, comme en vrai
// où la connexion crée le compte. La base de test est partagée : les entités
// de ce fichier portent un préfixe, et chaque test efface ses lignes du
// journal. Les fichiers qui suppriment les comptes ne comptent pas sur ce
// nettoyage : tests/aide-comptes.ts efface d'abord les lignes qui resteraient.
const ENTITE = "test_journal";
const TABLE_EFFETS = "test_journal_effets";
const ADMIN = { email: UTILISATEURS_DEMO.admin.email };

beforeAll(async () => {
  for (const { email, role } of Object.values(UTILISATEURS_DEMO)) {
    await query("INSERT INTO utilisateurs (email, role) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING", [email, role]);
  }
  await query(`CREATE TABLE IF NOT EXISTS ${TABLE_EFFETS} (valeur TEXT NOT NULL)`);
});

afterEach(async () => {
  await query("DELETE FROM journal_audit WHERE entite LIKE $1", [`${ENTITE}%`]);
  await query(`DELETE FROM ${TABLE_EFFETS}`);
});

afterAll(async () => {
  await query(`DROP TABLE IF EXISTS ${TABLE_EFFETS}`);
});

describe("journaliser", () => {
  it("note qui, quand, quelle entité et quelle action, l'auteur étant la personne de la session", async () => {
    jouer("admin");
    const auteur = await auteurCourant();
    await transaction((tx) =>
      journaliser(tx, auteur, { action: "creation", entite: ENTITE, entiteId: 7, libelle: "D-7" })
    );
    const [ligne] = await lireJournal({ entite: ENTITE });
    expect(ligne).toMatchObject({
      auteur: UTILISATEURS_DEMO.admin.email,
      action: "creation",
      entite: ENTITE,
      entite_id: "7",
      libelle: "D-7",
      champs: [],
    });
    expect(Date.now() - new Date(ligne.le).getTime()).toBeLessThan(60_000);
  });

  it("une écriture et sa trace se font ensemble ou pas du tout : une écriture qui échoue après la trace n'en laisse aucune", async () => {
    await expect(
      transaction(async (tx) => {
        await journaliser(tx, ADMIN, { action: "creation", entite: ENTITE, entiteId: 1, libelle: "X" });
        await tx.query(`INSERT INTO ${TABLE_EFFETS} (valeur) VALUES (NULL)`);
      })
    ).rejects.toThrow();
    expect(await lireJournal({ entite: ENTITE })).toEqual([]);
  });

  it("sans personne connectée, ne donne aucun auteur, avant toute transaction : aucune écriture sans auteur", async () => {
    jouer(null);
    await expect(auteurCourant()).rejects.toThrow(ErreurJournal);
  });

  it("refuse un auteur absent de la base et annule l'écriture qu'il devait tracer : l'auteur se désigne par son compte, jamais par une adresse libre", async () => {
    jouer("role-retire");
    const auteur = await auteurCourant();
    await expect(
      transaction(async (tx) => {
        await tx.query(`INSERT INTO ${TABLE_EFFETS} (valeur) VALUES ('effet')`);
        await journaliser(tx, auteur, { action: "creation", entite: ENTITE, entiteId: 1, libelle: "X" });
      })
    ).rejects.toThrow(ErreurJournal);
    expect(await query(`SELECT valeur FROM ${TABLE_EFFETS}`)).toEqual([]);
  });

  it("n'écrit rien pour une modification qui ne change aucun champ (un formulaire enregistré tel quel)", async () => {
    await transaction((tx) =>
      journaliser(tx, ADMIN, { action: "modification", entite: ENTITE, entiteId: 1, libelle: "X", champs: [] })
    );
    expect(await lireJournal({ entite: ENTITE })).toEqual([]);
  });

  it("refuse une entité qui n'est pas un identifiant simple et une action inconnue, avant toute écriture", async () => {
    await expect(
      transaction((tx) =>
        journaliser(tx, ADMIN, { action: "creation", entite: "Dossiers; --", entiteId: 1, libelle: "X" })
      )
    ).rejects.toThrow(ErreurJournal);
    await expect(
      transaction((tx) =>
        journaliser(tx, ADMIN, { action: "archivage" as never, entite: ENTITE, entiteId: 1, libelle: "X" })
      )
    ).rejects.toThrow(ErreurJournal);
  });
});

describe("table journal_audit", () => {
  it("ne garde aucune valeur de champ : ni colonne avant ni colonne après, seulement les noms des champs changés", async () => {
    const colonnes = await query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'journal_audit' ORDER BY ordinal_position"
    );
    expect(colonnes.map((colonne) => colonne.column_name)).toEqual([
      "id",
      "le",
      "utilisateur_id",
      "action",
      "entite",
      "entite_id",
      "libelle",
      "champs",
    ]);
  });

  it("refuse toute modification d'une ligne, même faite à la main en SQL : le journal ne se réécrit pas", async () => {
    await transaction((tx) =>
      journaliser(tx, ADMIN, { action: "creation", entite: ENTITE, entiteId: 1, libelle: "X" })
    );
    await expect(query("UPDATE journal_audit SET libelle = 'Y' WHERE entite = $1", [ENTITE])).rejects.toThrow(
      /ne se modifie pas/
    );
  });

  it("toute action que le code peut écrire passe la contrainte de la base, et la base n'en admet pas d'autre", async () => {
    const contrainte = await queryOne<{ definition: string }>(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'journal_audit_action_check'"
    );
    const admises = [...(contrainte?.definition ?? "").matchAll(/'([^']+)'/g)].map(
      (correspondance) => correspondance[1]
    );
    expect([...admises].sort()).toEqual([...ACTIONS_JOURNALISEES].sort());
  });

  it("a ses trois index (historique d'une fiche, ancienneté pour la purge, auteur) et une clé étrangère qui n'emporte rien", async () => {
    const index = await query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'journal_audit' AND indexname <> 'journal_audit_pkey' ORDER BY indexname"
    );
    expect(index.map((ligne) => ligne.indexname)).toEqual([
      "journal_audit_entite_idx",
      "journal_audit_le_idx",
      "journal_audit_utilisateur_id_idx",
    ]);
    // « r » : RESTRICT. Un compte qui a laissé une trace ne se supprime pas
    // (on le désactive) ; l'effacement RGPD l'anonymise sans le supprimer, et la
    // purge de la brique RGPD n'efface que des lignes du journal, jamais un compte.
    const cle = await queryOne<{ confdeltype: string }>(
      "SELECT confdeltype FROM pg_constraint WHERE conname = 'journal_audit_utilisateur_fk'"
    );
    expect(cle?.confdeltype).toBe("r");
  });
});

describe("lire le journal", () => {
  it("rend les lignes d'une entité, de la plus récente à la plus ancienne, et s'arrête à la limite", async () => {
    for (const libelle of ["A", "B", "C"]) {
      await transaction((tx) => journaliser(tx, ADMIN, { action: "creation", entite: ENTITE, entiteId: 1, libelle }));
    }
    await transaction((tx) =>
      journaliser(tx, ADMIN, { action: "creation", entite: ENTITE, entiteId: 2, libelle: "Autre" })
    );
    expect((await lireJournal({ entite: ENTITE, entiteId: 1 })).map((ligne) => ligne.libelle)).toEqual(["C", "B", "A"]);
    expect((await lireJournal({ entite: ENTITE, limite: 2 })).map((ligne) => ligne.libelle)).toEqual(["Autre", "C"]);
  });

  it("ne montre l'historique d'une fiche qu'à qui a journal.consulter : rien sans ce droit ni sans session", async () => {
    await transaction((tx) =>
      journaliser(tx, ADMIN, { action: "creation", entite: ENTITE, entiteId: 1, libelle: "A" })
    );
    // Le membre n'a pas le droit au catalogue ; une appli à un seul rôle le lui donne.
    jouer("membre");
    const pourLeMembre = await historiqueSiPermis(ENTITE, 1);
    expect(pourLeMembre === null).toBe(!peut(UTILISATEURS_DEMO.membre, "journal.consulter"));
    jouer(null);
    expect(await historiqueSiPermis(ENTITE, 1)).toBeNull();
    jouer("admin");
    expect((await historiqueSiPermis(ENTITE, 1))?.map((ligne) => ligne.libelle)).toEqual(["A"]);
  });
});

// La source « journal » de l'effacement des données d'une personne (brique
// rgpd) : le journal ne se réécrit pas, la base refuse tout UPDATE. Il désigne
// l'auteur par son numéro de compte : c'est l'anonymisation du compte (brique
// comptes) qui le détache de l'adresse.
describe("effacement des données d'une personne", () => {
  // Un compte propre au cas : ceux de la démo ont des lignes laissées par
  // d'autres fichiers, que le compte compterait aussi.
  const ELLE = { email: "journal.efface@exemple.test" };

  // Avant le nettoyage du fichier : la clé étrangère du journal retient le compte.
  afterEach(async () => {
    await query("DELETE FROM journal_audit WHERE entite LIKE $1", [`${ENTITE}%`]);
    await query("DELETE FROM utilisateurs WHERE email = $1", [ELLE.email]);
  });

  it("compte les gestes de l'adresse sans réécrire aucune ligne du journal", async () => {
    await query("INSERT INTO utilisateurs (email, role) VALUES ($1, 'membre')", [ELLE.email]);
    await transaction((tx) =>
      journaliser(tx, ELLE, { action: "creation", entite: ENTITE, entiteId: 1, libelle: "D-1" })
    );
    await transaction((tx) =>
      journaliser(tx, ADMIN, { action: "creation", entite: ENTITE, entiteId: 2, libelle: "D-2" })
    );
    const avant = await query(`SELECT * FROM journal_audit WHERE entite = $1 ORDER BY id`, [ENTITE]);

    const issue = await transaction((tx) => SOURCES_JOURNAL[0].effacer(tx, ELLE.email));

    expect(issue).toEqual({ lignes: 1 });
    expect(await query(`SELECT * FROM journal_audit WHERE entite = $1 ORDER BY id`, [ENTITE])).toEqual(avant);
  });
});

// L'export des données d'une personne par l'admin (brique rgpd) se trace :
// une lecture, mais celle de toutes les données d'une personne, faite pour
// une autre. Comme l'effacement, il désigne le compte par son numéro, jamais
// par l'adresse ; une adresse sans compte ne laisse donc rien.
describe("export des données d'une personne par l'admin", () => {
  const ELLE = { email: "journal.exportee@exemple.test" };

  afterEach(async () => {
    await query(
      `DELETE FROM journal_audit WHERE entite = 'compte'
          AND entite_id IN (SELECT id::text FROM utilisateurs WHERE email = $1)`,
      [ELLE.email]
    );
    await query("DELETE FROM utilisateurs WHERE email = $1", [ELLE.email]);
  });

  it("trace l'export au nom de l'admin, sur « compte n°<id> », sans l'adresse exportée", async () => {
    const [{ id }] = await query<{ id: number }>(
      "INSERT INTO utilisateurs (email, role) VALUES ($1, 'membre') RETURNING id",
      [ELLE.email]
    );

    await transaction((tx) => SOURCES_JOURNAL[0].tracerExport(tx, ELLE.email, ADMIN));

    const lignes = await lireJournal({ entite: "compte", entiteId: id });
    expect(lignes).toEqual([
      expect.objectContaining({ auteur: ADMIN.email, action: "export", libelle: `compte n°${id}`, champs: [] }),
    ]);
    expect(JSON.stringify(lignes)).not.toContain(ELLE.email);
  });

  it("ne trace rien pour une adresse sans compte : le journal ne garde aucune adresse", async () => {
    const avant = await query("SELECT count(*) AS n FROM journal_audit");
    await transaction((tx) => SOURCES_JOURNAL[0].tracerExport(tx, ELLE.email, ADMIN));
    expect(await query("SELECT count(*) AS n FROM journal_audit")).toEqual(avant);
  });
});

// La base garde le DELETE du journal pour cette purge seule : 12 mois après
// le geste, par le script de la brique rgpd, que lance un humain. Les durées
// proposées par la brique, pas celles de l'appli : un client qui surcharge la
// sienne (CONFIDENTIALITE.durees) garde ce test vert.
describe("purge du journal au terme de sa conservation (brique rgpd)", () => {
  const DU_JOURNAL = TRAITEMENTS_JOURNAL.flatMap(({ titre, conservation }) =>
    conservation.map((declaree) => ({ ...declaree, traitement: titre }))
  );

  it("le journal déclare 12 mois après le geste, purgés par le script seul, jamais au passage", () => {
    expect(DU_JOURNAL).toEqual([
      expect.objectContaining({ duree: { mois: 12 }, purge: { table: "journal_audit", colonne: "le" } }),
    ]);
    // Et aucune autre déclaration de l'appli ne vise le journal (un module qui
    // le purgerait au passage).
    expect(
      conservations()
        .filter(({ purge }) => "table" in purge && purge.table === "journal_audit")
        .map(({ cle }) => cle)
    ).toEqual(["journal"]);
  });

  it("efface les lignes de plus de 12 mois et garde les plus récentes", async () => {
    for (const [libelle, mois] of [
      ["ancienne", 13],
      ["recente", 11],
    ] as const) {
      await query(
        `INSERT INTO journal_audit (le, utilisateur_id, action, entite, entite_id, libelle)
         SELECT now() - make_interval(months => $2), id, 'creation', $3, '1', $1 FROM utilisateurs WHERE email = $4`,
        [libelle, mois, ENTITE, ADMIN.email]
      );
    }

    await purger({ transaction, conservations: DU_JOURNAL });

    expect((await lireJournal({ entite: ENTITE })).map((ligne) => ligne.libelle)).toEqual(["recente"]);
  });
});
