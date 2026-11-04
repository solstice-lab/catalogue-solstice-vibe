import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ErreurMiseAJour, lireLesEtapes, reporterLesMigrations } from "../outils/mettre-a-jour.mjs";
import { MIGRATIONS } from "../src/lib/db/migrations";

/*
 * Les étapes de migration dans la mise à jour d'une appli (outils/mise-a-jour.md,
 * « Les migrations ») : lues par leur nom dans les trois versions, les neuves
 * ajoutées EN FIN de la liste de l'appli, jamais à leur rang du catalogue. Une
 * base déployée a déjà rejoué les étapes de l'appli dans leur ordre (CLAUDE.md
 * §3, docs/cicatrices.md D2) ; une fusion de texte placerait l'étape d'une
 * brique ajoutée au milieu d'elles.
 *
 * Ces cas ne rejouent ni assemblage ni base : ils tournent avec npm test. Le
 * rejeu des étapes reportées sur Postgres est dans tests/mettre-a-jour.test.ts.
 * Catalogue seulement (EXCLUS_DU_CATALOGUE) : une appli n'a pas l'outil.
 */

const FICHIER = "src/lib/db/migrations.ts";

// Un migrations.ts réduit, de la forme de celui du catalogue.
const fichier = (...etapes: string[]) =>
  [
    'import type { Pool } from "pg";',
    "",
    "/* Migrations de schéma : en-tête. */",
    "",
    "type Migration = { nom: string; appliquer: (pool: Pool) => Promise<void> };",
    "",
    `export const MIGRATIONS: Migration[] = [\n${etapes.join("")}];`,
    "",
    "export async function appliquerMigrations(pool: Pool): Promise<void> {",
    "  for (const migration of MIGRATIONS) await migration.appliquer(pool);",
    "}",
    "",
  ].join("\n");

const etape = (nom: string, { sql = "SELECT 1;", commentaire = "Pourquoi cette étape." } = {}) =>
  `  {\n    // ${commentaire}\n    nom: ${JSON.stringify(nom)},\n    async appliquer(pool) {\n      await pool.query(\`${sql}\`);\n    },\n  },\n`;

// Le squelette (en-tête, fonction qui rejoue) est le même : la fusion à trois n'a pas à être appelée.
const sansFusion = () => {
  throw new Error("fusion appelée sans raison");
};

const reporter = (origine: string, cible: string, appli: string) =>
  reporterLesMigrations({ origine, cible, appli, fusionner: sansFusion });

function refusDe(action: () => unknown): string {
  try {
    action();
  } catch (erreur) {
    expect(erreur).toBeInstanceOf(ErreurMiseAJour);
    return (erreur as Error).message;
  }
  throw new Error("aucun refus");
}

const A = etape("a : première étape du catalogue");
const B = etape("b : deuxième étape du catalogue");
const X = etape("x : étape d'une brique ajoutée, au milieu du catalogue");
const Y = etape("y : étape ajoutée en fin du catalogue");
const P = etape("p : étape de l'appli");

/*
 * Le verrou : l'outil reconnaît une étape à son nom. Deux étapes du même nom
 * dans migrations.ts du catalogue, et l'outil ne saurait plus laquelle une appli
 * a reçue ; une lecture qui ne trouve rien laisserait passer n'importe quoi.
 */
function verrouDesNoms(texte: string) {
  const etapes = lireLesEtapes(texte, FICHIER);
  if (etapes.length === 0) throw new Error(`Aucune étape lue dans ${FICHIER} : la lecture est à reprendre.`);
  return etapes;
}

describe("migrations.ts du catalogue, lu par l'outil de mise à jour (test-verrou)", () => {
  it("chaque étape porte un nom à elle, écrit en clair, et la lecture syntaxique trouve toutes les étapes que l'appli rejoue", () => {
    const etapes = verrouDesNoms(fs.readFileSync(FICHIER, "utf-8"));
    expect(etapes.map(({ nom }) => nom)).toEqual(MIGRATIONS.map(({ nom }) => nom));
    expect(new Set(etapes.map(({ nom }) => nom)).size).toBe(etapes.length);
  });

  it("attrape deux étapes du même nom (le cas fautif que le verrou refuse)", () => {
    expect(refusDe(() => verrouDesNoms(fichier(A, B, A)))).toMatch(/« a : première étape du catalogue ».*deux fois/);
  });

  it("échoue s'il ne lit aucune étape : une liste vide ou un fichier sans MIGRATIONS ne passent pas", () => {
    expect(() => verrouDesNoms(fichier())).toThrow(/Aucune étape lue/);
    expect(refusDe(() => verrouDesNoms("export const AUTRE = [];\n"))).toMatch(/pas de tableau MIGRATIONS/);
  });
});

describe("lireLesEtapes : les étapes de MIGRATIONS par leur nom, sans exécuter le fichier", () => {
  it("rend le texte de chaque étape tel quel, commentaires d'avant l'accolade compris, et son code sans les commentaires", () => {
    const avecEnTete = `  // Brique x : sa table.\n${X}`;
    const [, x] = lireLesEtapes(fichier(A, avecEnTete), FICHIER);
    expect(x.nom).toBe("x : étape d'une brique ajoutée, au milieu du catalogue");
    expect(`${x.texte},\n`).toBe(avecEnTete);
    // Un commentaire changé ne change pas le code ; une ligne de SQL, si.
    const [commentaire] = lireLesEtapes(fichier(etape("a", { commentaire: "Autre." })), FICHIER);
    const [code] = lireLesEtapes(fichier(etape("a", { sql: "SELECT 2;" })), FICHIER);
    const [origine] = lireLesEtapes(fichier(etape("a")), FICHIER);
    expect(commentaire.code).toBe(origine.code);
    expect(commentaire.texte).not.toBe(origine.texte);
    expect(code.code).not.toBe(origine.code);
  });

  it("laisse à l'étape précédente le commentaire écrit après sa virgule, sur la même ligne", () => {
    const [a, b] = lireLesEtapes(fichier(A.replace(/,\n$/, ", // fin de a\n"), B), FICHIER);
    expect(a.texte.endsWith("}")).toBe(true);
    expect(b.texte).not.toContain("fin de a");
    expect(`${b.texte},\n`).toBe(B);
  });

  it("refuse un nom qui n'est pas une chaîne écrite en clair, ou une étape qui n'est pas un objet écrit dans la liste", () => {
    expect(refusDe(() => lireLesEtapes(fichier(A.replace(/nom: "[^"]+"/, "nom: NOM_DE_L_ETAPE")), FICHIER))).toMatch(
      /nom.*en clair/
    );
    expect(refusDe(() => lireLesEtapes(fichier(A, "  ...MIGRATIONS_D_UNE_BRIQUE,\n"), FICHIER))).toMatch(
      /pas un objet/
    );
  });

  it("refuse une étape qui lit une valeur déclarée hors de la liste : ce qu'elle joue changerait sans que son texte change", () => {
    const avecConstante = fichier(etape("a", { sql: "${SQL_INDEX}" })).replace(
      "type Migration",
      'const SQL_INDEX = "CREATE INDEX IF NOT EXISTS i ON t (c);";\n\ntype Migration'
    );
    expect(refusDe(() => lireLesEtapes(avecConstante, FICHIER))).toMatch(/« a » lit « SQL_INDEX ».*d'un seul tenant/);
    // Un type importé ne joue rien : il passe.
    const avecType = fichier(etape("a")).replace("async appliquer(pool)", "async appliquer(pool: Pool)");
    expect(lireLesEtapes(avecType, FICHIER).map(({ nom }) => nom)).toEqual(["a"]);
  });

  it("refuse un fichier qui ne se lit pas comme du TypeScript", () => {
    expect(
      refusDe(() => lireLesEtapes(fichier(A).replace("async appliquer(pool) {", "async appliquer(pool {"), FICHIER))
    ).toMatch(/ne se lit pas/);
  });
});

describe("reporterLesMigrations : les étapes neuves de la cible en fin de la liste de l'appli", () => {
  it("ajoute après les étapes de l'appli celles de la cible absentes de l'origine, dans l'ordre de la cible, au texte inchangé", () => {
    // La cible place x à son rang dans le catalogue (une brique ajoutée) et y en fin.
    const resultat = reporter(fichier(A, B), fichier(A, X, B, Y), fichier(A, B, P));
    expect(resultat.contenu).toBe(fichier(A, B, P, X, Y));
    expect(resultat.ajoutees).toEqual([
      "x : étape d'une brique ajoutée, au milieu du catalogue",
      "y : étape ajoutée en fin du catalogue",
    ]);
    // x précède au catalogue une étape que l'appli a déjà : mise en fin, elle se signale.
    expect(resultat.auMilieu).toEqual(["x : étape d'une brique ajoutée, au milieu du catalogue"]);
    expect(resultat).toMatchObject({ conflits: 0, reste: false, commentaires: [], retouchees: [] });
  });

  it("met les étapes ajoutées après un commentaire qui clôt la liste de l'appli", () => {
    const clos = (texte: string) => texte.replace(/\];\n\nexport/, "  // Fin des étapes de l'appli.\n];\n\nexport");
    expect(reporter(fichier(A), fichier(A, Y), clos(fichier(A, P))).contenu).toBe(
      clos(fichier(A, P)).replace("];\n\nexport", `${Y}];\n\nexport`)
    );
  });

  it("signale, sans s'arrêter ni la toucher, une étape reçue dont l'appli a changé le code", () => {
    const appli = fichier(etape("a : première étape du catalogue", { sql: "SELECT 9;" }), B);
    const resultat = reporter(fichier(A, B), fichier(A, B, Y), appli);
    expect(resultat.retouchees).toEqual(["a : première étape du catalogue"]);
    expect(resultat.contenu).toBe(`${appli.replace("];\n\nexport", `${Y}];\n\nexport`)}`);
  });

  it("s'arrête si les étapes de l'origine changent d'ordre dans la cible", () => {
    const message = refusDe(() => reporter(fichier(A, B), fichier(B, A, Y), fichier(A, B)));
    expect(message).toMatch(/changent d'ordre/);
    expect(message).toMatch(/--vers/);
  });

  it("garde l'en-tête et la fonction de l'appli quand le catalogue n'y touche pas", () => {
    const appli = fichier(A, B, P).replace("en-tête.", "en-tête, retouché par l'appli.");
    expect(reporter(fichier(A, B), fichier(A, B, Y), appli).contenu).toBe(
      fichier(A, B, P, Y).replace("en-tête.", "en-tête, retouché par l'appli.")
    );
  });

  it("met la virgule qui manque après la dernière étape de l'appli, et remplit une liste vide", () => {
    const sansVirgule = fichier(A, P).replace(/,\n\];/, "\n];");
    expect(reporter(fichier(A), fichier(A, Y), sansVirgule).contenu).toBe(fichier(A, P, Y));
    expect(reporter(fichier(), fichier(Y), fichier().replace("[\n];", "[];")).contenu).toBe(fichier(Y));
  });

  it("signale, sans rien reporter, une étape de l'origine dont seul le commentaire a changé", () => {
    const resultat = reporter(
      fichier(A, B),
      fichier(etape("a : première étape du catalogue", { commentaire: "Mieux dit." }), B),
      fichier(A, B, P)
    );
    expect(resultat.commentaires).toEqual(["a : première étape du catalogue"]);
    expect(resultat.ajoutees).toEqual([]);
    // Rien à écrire : l'appli garde son texte.
    expect(resultat.contenu).toBeUndefined();
  });

  it("s'arrête si une étape de l'origine a changé de code dans la cible : le catalogue aurait retouché une étape publiée", () => {
    const message = refusDe(() =>
      reporter(
        fichier(A, B),
        fichier(etape("a : première étape du catalogue", { sql: "SELECT 2;" }), B, Y),
        fichier(A, B)
      )
    );
    expect(message).toMatch(/« a : première étape du catalogue ».*code/);
    expect(message).toMatch(/--vers/);
  });

  it("s'arrête si une étape de l'origine a disparu de la cible", () => {
    const message = refusDe(() => reporter(fichier(A, B), fichier(A, Y), fichier(A, B)));
    expect(message).toMatch(/« b : deuxième étape du catalogue ».*cible/);
    expect(message).toMatch(/--vers/);
  });

  it("s'arrête si une étape de l'origine manque à l'appli : une étape à ajouter peut en dépendre", () => {
    const message = refusDe(() => reporter(fichier(A, B), fichier(A, B, Y), fichier(A, P)));
    expect(message).toMatch(/« b : deuxième étape du catalogue ».*manque à l'appli/);
    expect(message).toMatch(/[Rr]emettre/);
  });

  it("s'arrête si le nom d'une étape à ajouter existe déjà dans l'appli (une étape recopiée à la main)", () => {
    const message = refusDe(() =>
      reporter(
        fichier(A, B),
        fichier(A, B, Y),
        fichier(A, B, etape("y : étape ajoutée en fin du catalogue", { sql: "SELECT 3;" }))
      )
    );
    expect(message).toMatch(/« y : étape ajoutée en fin du catalogue ».*existe déjà dans l'appli/);
    expect(message).toMatch(/[Rr]enommer/);
  });

  it("s'arrête si l'appli a supprimé migrations.ts que le catalogue change, ou si le catalogue le retire", () => {
    const sansLAppli = refusDe(() =>
      reporterLesMigrations({ origine: fichier(A), cible: fichier(A, Y), appli: undefined, fusionner: sansFusion })
    );
    expect(sansLAppli).toMatch(/L'appli a supprimé src\/lib\/db\/migrations\.ts.*[Rr]emettre/);
    const sansLaCible = refusDe(() =>
      reporterLesMigrations({ origine: fichier(A), cible: undefined, appli: fichier(A), fusionner: sansFusion })
    );
    expect(sansLaCible).toMatch(/catalogue retire src\/lib\/db\/migrations\.ts.*--vers/);
  });

  it("s'arrête si deux étapes de l'appli portent le même nom", () => {
    expect(refusDe(() => reporter(fichier(A, B), fichier(A, B, Y), fichier(A, B, P, P)))).toMatch(
      /« p : étape de l'appli ».*deux fois.*l'appli/
    );
  });

  it("dit tous les arrêts à la fois, pour qu'un seul passage les donne", () => {
    const message = refusDe(() =>
      reporter(fichier(A, B), fichier(A, B, Y), fichier(A, etape("y : étape ajoutée en fin du catalogue")))
    );
    expect(message).toMatch(/« b : deuxième étape du catalogue ».*manque à l'appli/);
    expect(message).toMatch(/« y : étape ajoutée en fin du catalogue ».*existe déjà/);
  });

  it("passe le reste du fichier par la fusion à trois quand le catalogue le change, la liste de l'appli restant la sienne", () => {
    const vus: string[][] = [];
    const resultat = reporterLesMigrations({
      origine: fichier(A),
      cible: fichier(A, Y).replace("en-tête.", "en-tête, évolué au catalogue."),
      appli: fichier(A, P),
      fusionner: ({ origine, cible, appli }: { origine: string; cible: string; appli: string }) => {
        vus.push([origine, cible, appli]);
        // Ce que donnerait git merge-file : l'appli n'a pas touché l'en-tête.
        return { contenu: cible, conflits: 0 };
      },
    });
    expect(vus).toHaveLength(1);
    // La fusion ne voit pas les étapes : chacune garde le même tableau, réduit à une marque.
    for (const version of vus[0]) expect(version).not.toMatch(/nom: "/);
    expect(resultat.contenu).toBe(fichier(A, P, Y).replace("en-tête.", "en-tête, évolué au catalogue."));
    expect(resultat.reste).toBe(true);
  });

  // Ce que rend git merge-file quand l'appli et le catalogue réécrivent la même ligne de l'en-tête.
  const enConflit = (squelette: string) =>
    squelette.replace(
      "/* Migrations de schéma : en-tête. */",
      "<<<<<<< appli\n/* En-tête de l'appli. */\n||||||| origine\n/* Migrations de schéma : en-tête. */\n=======\n/* En-tête du catalogue. */\n>>>>>>> cible"
    );

  it("écrit un reste du fichier en conflit avec ses marqueurs, les étapes ajoutées en fin quand même", () => {
    const resultat = reporterLesMigrations({
      origine: fichier(A),
      cible: fichier(A, Y).replace("en-tête.", "en-tête du catalogue."),
      appli: fichier(A, P),
      fusionner: ({ appli }: { appli: string }) => ({ contenu: enConflit(appli), conflits: 1 }),
    });
    expect(resultat.conflits).toBe(1);
    expect(resultat.contenu).toBe(enConflit(fichier(A, P, Y)));
  });

  it("s'arrête si la fusion du reste du fichier a mêlé ses conflits à la liste des étapes", () => {
    const message = refusDe(() =>
      reporterLesMigrations({
        origine: fichier(A),
        cible: fichier(A, Y).replace("en-tête.", "en-tête du catalogue."),
        appli: fichier(A, P),
        // La marque de la liste prise dans un conflit : deux fois, d'un côté et de l'autre.
        fusionner: ({ appli }: { appli: string }) => ({ contenu: `${appli}${appli}`, conflits: 1 }),
      })
    );
    expect(message).toMatch(/a mêlé ses conflits à la liste MIGRATIONS.*à la main/);
  });
});
