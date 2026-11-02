import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query, queryOne } from "../src/lib/db/client";
import { empreinteDeLAdresse } from "../src/briques/comptes/code-email";
import { secretDeSession } from "../src/briques/comptes/jeton";
import { NON_EXPORTEES, SOURCES, TABLES_SANS_DONNEE_PERSONNELLE } from "../src/config/donnees-personnelles";
import { exporterDonnees, masquerAutresAdresses, tablesNonDeclarees } from "../src/briques/rgpd/export";

/*
 * L'export des données d'une personne : tout ce que
 * l'appli garde sur une adresse, en JSON. Les empreintes (jeton de session,
 * code, adresse IP) ne se lisent pas : l'export le dit au lieu de les sortir.
 *
 * Les lignes de ces tests portent des adresses en .test, effacées après chaque
 * cas : la base de test est partagée avec les autres fichiers.
 */

const ELLE = "personne.export@exemple.test";
const AUTRE = "autre.personne@exemple.test";
const EMPREINTE_SESSION = "empreinte-de-session-du-test-rgpd";
const TYPE = "test-rgpd-export";

async function nettoyer() {
  await query(`DELETE FROM sessions WHERE empreinte LIKE 'empreinte-de-session-du-test-rgpd%'`);
  await query(`DELETE FROM journal_audit WHERE entite = 'test_rgpd_journal'`);
  await query(`DELETE FROM utilisateurs WHERE email IN ($1, $2)`, [ELLE, AUTRE]);
  const secret = secretDeSession();
  await query(`DELETE FROM codes_connexion WHERE adresse_empreinte IN ($1, $2)`, [
    empreinteDeLAdresse(secret, ELLE),
    empreinteDeLAdresse(secret, AUTRE),
  ]);
  await query(`DELETE FROM propositions WHERE type = $1`, [TYPE]);
  await query(`DELETE FROM import_lots WHERE nom_fichier = 'test-rgpd-export.csv'`);
}

async function compte(email: string): Promise<number> {
  const ligne = await queryOne<{ id: number }>(
    `INSERT INTO utilisateurs (email, role) VALUES ($1, 'membre') RETURNING id`,
    [email]
  );
  return ligne!.id;
}

async function demandeDeCode(email: string) {
  const secret = secretDeSession();
  await query(
    `INSERT INTO codes_connexion (adresse_empreinte, ip_empreinte, code_empreinte, expire_le)
     VALUES ($1, 'empreinte-ip-du-test', 'empreinte-code-du-test', now() + interval '10 minutes')`,
    [empreinteDeLAdresse(secret, email)]
  );
}

const source = (resultat: Awaited<ReturnType<typeof exporterDonnees>>, cle: string) => {
  const trouvee = resultat.sources.find((s) => s.cle === cle);
  if (!trouvee) throw new Error(`source « ${cle} » absente de l'export`);
  return trouvee;
};

beforeEach(nettoyer);
afterEach(nettoyer);

describe("export des données d'une personne", () => {
  it("sort le compte, les sessions et les demandes de code de l'adresse, et rien de ceux d'une autre", async () => {
    const id = await compte(ELLE);
    const idAutre = await compte(AUTRE);
    await query(
      `INSERT INTO sessions (empreinte, utilisateur_id, expire_le) VALUES ($1, $2, now() + interval '30 days')`,
      [EMPREINTE_SESSION, id]
    );
    await query(
      `INSERT INTO sessions (empreinte, utilisateur_id, expire_le) VALUES ($1, $2, now() + interval '30 days')`,
      [`${EMPREINTE_SESSION}-autre`, idAutre]
    );
    await demandeDeCode(ELLE);
    await demandeDeCode(AUTRE);

    const resultat = await exporterDonnees(ELLE);

    expect(resultat.adresse).toBe(ELLE);
    expect(source(resultat, "compte").lignes).toEqual([
      expect.objectContaining({ email: ELLE, role: "membre", actif: true }),
    ]);
    expect(source(resultat, "sessions").lignes).toHaveLength(1);
    expect(source(resultat, "codes-connexion").lignes).toHaveLength(1);
    expect(JSON.stringify(resultat)).not.toContain(AUTRE);
  });

  // Une empreinte ne se lit pas : la sortir n'apprend rien à la personne, et
  // celle du jeton de session donnerait une prise de plus à qui récupère le
  // fichier. L'export dit ce qu'il garde pour lui.
  it("ne sort aucune empreinte, et dit pourquoi dans les notes", async () => {
    const id = await compte(ELLE);
    await query(
      `INSERT INTO sessions (empreinte, utilisateur_id, expire_le) VALUES ($1, $2, now() + interval '30 days')`,
      [EMPREINTE_SESSION, id]
    );
    await demandeDeCode(ELLE);

    const texte = JSON.stringify(await exporterDonnees(ELLE));

    for (const empreinte of [
      EMPREINTE_SESSION,
      "empreinte-ip-du-test",
      "empreinte-code-du-test",
      empreinteDeLAdresse(secretDeSession(), ELLE),
    ]) {
      expect(texte).not.toContain(empreinte);
    }
    expect(source(await exporterDonnees(ELLE), "sessions").note).toMatch(/empreinte/);
  });

  it("retrouve l'adresse quelles que soient sa casse et ses espaces", async () => {
    await compte(ELLE);
    const resultat = await exporterDonnees(`  ${ELLE.toUpperCase()} `);
    expect(resultat.adresse).toBe(ELLE);
    expect(source(resultat, "compte").lignes).toHaveLength(1);
  });

  it("répond pour une adresse inconnue : toutes les sources, vides, et les notes", async () => {
    const resultat = await exporterDonnees("inconnue@exemple.test");
    expect(resultat.sources.map((s) => s.cle)).toEqual(SOURCES.map((s) => s.cle));
    for (const s of resultat.sources) expect(s.lignes).toEqual([]);
    expect(resultat.non_exportees.length).toBe(NON_EXPORTEES.length);
  });

  // Le demandeur d'une demande d'achat n'est que dans le contenu JSON de la
  // proposition : la recherche lit le contenu, pas une colonne propre au module.
  it("sort les propositions décidées par la personne ou dont le contenu cite son adresse", async () => {
    await query(
      `INSERT INTO propositions (type, cle, contenu, statut, decide_le, decide_par)
       VALUES ($1, 'a', '{"objet": "x"}', 'acceptee', now(), $2),
              ($1, 'b', $3::jsonb, 'en_attente', NULL, NULL),
              ($1, 'c', $4::jsonb, 'en_attente', NULL, NULL)`,
      [
        TYPE,
        ELLE,
        JSON.stringify({ demandeur_email: ELLE, lignes: [{ quantite: 1 }] }),
        JSON.stringify({ demandeur_email: AUTRE }),
      ]
    );

    const lignes = source(await exporterDonnees(ELLE), "propositions").lignes as { cle: string }[];
    expect(lignes.map((ligne) => ligne.cle).sort()).toEqual(["a", "b"]);
  });

  // Le droit d'accès ne doit pas livrer les données d'autrui (RGPD art. 15.4) :
  // le décideur d'une demande, un autre demandeur cité dans le même contenu.
  it("masque toute autre adresse e-mail que celle exportée", async () => {
    await query(
      `INSERT INTO propositions (type, cle, contenu, statut, decide_le, decide_par)
       VALUES ($1, 'e', $2::jsonb, 'acceptee', now(), $3)`,
      [TYPE, JSON.stringify({ demandeur_email: ELLE, copie_a: AUTRE }), "Admin.Decideur@exemple.test"]
    );

    const texte = JSON.stringify(await exporterDonnees(ELLE));
    expect(texte).toContain(ELLE);
    expect(texte).not.toContain(AUTRE);
    expect(texte.toLowerCase()).not.toContain("admin.decideur@exemple.test");
    expect(texte).toContain("adresse d'une autre personne, masquée");
  });

  // Une adresse qui en contient une autre (« x.elle@… » contient « elle@… »)
  // ne doit pas passer pour elle.
  it("ne confond pas l'adresse avec une adresse qui la contient", async () => {
    await query(`INSERT INTO propositions (type, cle, contenu) VALUES ($1, 'd', $2::jsonb)`, [
      TYPE,
      JSON.stringify({ demandeur_email: `x.${ELLE}` }),
    ]);
    expect(source(await exporterDonnees(ELLE), "propositions").lignes).toEqual([]);
  });

  it("sort les lignes d'un fichier importé où l'adresse figure", async () => {
    const lot = await queryOne<{ id: number }>(
      `INSERT INTO import_lots (branchement, nom_fichier) VALUES ('test', 'test-rgpd-export.csv') RETURNING id`
    );
    await query(
      `INSERT INTO import_lot_lignes (lot_id, ordre, numero, numeros, valeurs)
       VALUES ($1, 1, 2, '{2}', $2::jsonb), ($1, 2, 3, '{3}', $3::jsonb)`,
      [lot!.id, JSON.stringify({ contact: ELLE }), JSON.stringify({ contact: AUTRE })]
    );

    const lignes = source(await exporterDonnees(ELLE), "lignes-importees").lignes;
    expect(lignes).toEqual([expect.objectContaining({ nom_fichier: "test-rgpd-export.csv", numero: 2 })]);
  });

  // Le journal désigne son auteur par son compte, jamais par son adresse : il
  // se retrouve par la jointure, et ne garde aucune valeur de champ.
  it("sort les gestes que la personne a faits au journal, et pas ceux d'une autre", async () => {
    const id = await compte(ELLE);
    const idAutre = await compte(AUTRE);
    await query(
      `INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, libelle, champs)
       VALUES ($1, 'modification', 'test_rgpd_journal', '1', 'D-1', '{client}'),
              ($2, 'creation', 'test_rgpd_journal', '2', 'D-2', '{}')`,
      [id, idAutre]
    );

    const lignes = source(await exporterDonnees(ELLE), "journal").lignes;
    expect(lignes).toEqual([expect.objectContaining({ action: "modification", libelle: "D-1", champs: ["client"] })]);
  });
});

/*
 * Test-verrou : une table neuve (un module, une brique) se déclare dans
 * src/config/donnees-personnelles.ts, comme source de l'export, comme donnée
 * non exportée avec sa raison, ou comme table sans donnée personnelle. Sans ce
 * verrou, une table oubliée manquerait à l'export sans que rien ne le dise.
 */
describe("verrou des tables de l'export", () => {
  it("chaque table de la base est déclarée, et chaque déclaration nomme une table qui existe", async () => {
    const tables = (
      await query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      )
    ).map((ligne) => ligne.table_name);
    expect(tables.length).toBeGreaterThan(0);
    expect(tablesNonDeclarees(tables)).toEqual({ oubliees: [], fantomes: [] });
  });

  it("attrape une table oubliée et une déclaration sans table", () => {
    const declarees = [
      ...SOURCES.flatMap((s) => s.tables),
      ...NON_EXPORTEES.flatMap((n) => n.tables),
      ...Object.keys(TABLES_SANS_DONNEE_PERSONNELLE),
    ];
    const tables = [...declarees.filter((table) => table !== "utilisateurs"), "nouvelle_table"];
    expect(tablesNonDeclarees(tables)).toEqual({ oubliees: ["nouvelle_table"], fantomes: ["utilisateurs"] });
  });
});

// Le masquage vaut pour toute source, celles des briques que l'appli garde
// comme les siennes : il se vérifie ici sans dépendre d'aucune table.
describe("masquage des adresses d'autrui (RGPD art. 15.4)", () => {
  it("masque toute adresse autre que celle exportée, à toute profondeur, et garde les dates", () => {
    const quand = new Date("2026-01-01T00:00:00Z");
    expect(
      masquerAutresAdresses(
        { a: "Écrit par Autre@Exemple.test", b: [{ c: ELLE.toUpperCase() }], quand, n: 3, vide: null },
        ELLE
      )
    ).toEqual({
      a: "Écrit par (adresse d'une autre personne, masquée)",
      b: [{ c: ELLE.toUpperCase() }],
      quand,
      n: 3,
      vide: null,
    });
  });
});
