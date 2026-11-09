import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { libelleBase, modeEcriture } from "../scripts/lib/cli";

// Cas d'origine (constaté à un essai) : un script de démo lancé
// avec --confirmer depuis le mauvais dossier a lu un autre .env.local, et la
// base de l'appli est restée vide sans que rien ne le signale. Le rapport ne
// nommait jamais la base : la relecture avant --confirmer ne pouvait pas
// l'attraper.
//
// Les URLs à mot de passe pointent localhost : les gardes du harnais refusent
// d'écrire dans un fichier une URL distante avec mot de passe, même factice.
// L'hôte ne change rien à ce que le libellé doit taire.

describe("libellé de la base visée par un script de données", () => {
  it("donne hôte, port et nom de la base", () => {
    expect(libelleBase("postgresql://postgres@localhost:5433/suivi_maintenance_dev")).toBe(
      "localhost:5433/suivi_maintenance_dev"
    );
  });

  it("ne montre jamais le mot de passe, l'utilisateur ni la chaîne de requête (le rapport se copie dans un ticket)", () => {
    const libelle = libelleBase(
      "postgresql://admin:S3cret%21@localhost:5432/appli_prod?sslmode=require&password=AutreSecret"
    );
    expect(libelle).toBe("localhost:5432/appli_prod");
    for (const fuite of ["S3cret", "admin", "sslmode", "AutreSecret", "?", "@"]) {
      expect(libelle).not.toContain(fuite);
    }
  });

  it("nomme l'hôte et le port que pg prend vraiment : ?host= et ?port= passent devant ceux de l'URL", () => {
    expect(libelleBase("postgresql://postgres@localhost:5433/appli_dev?host=db.exemple.fr&port=6432")).toBe(
      "db.exemple.fr:6432/appli_dev"
    );
  });

  it("ne laisse pas fuiter un mot de passe non encodé qui contient « / » (lu comme port puis chemin)", () => {
    const libelle = libelleBase("postgresql://admin:2024/S3cret@localhost/appli_dev");
    expect(libelle).toMatch(/DATABASE_URL illisible/);
    expect(libelle).not.toContain("S3cret");
  });

  it("garde l'hôte seul quand l'URL ne précise pas de port", () => {
    expect(libelleBase("postgres://postgres@db.exemple.fr/appli_dev")).toBe("db.exemple.fr/appli_dev");
  });

  it("dit l'absence de DATABASE_URL plutôt que de taire la base", () => {
    expect(libelleBase(undefined)).toMatch(/DATABASE_URL absent/);
    expect(libelleBase("")).toMatch(/DATABASE_URL absent/);
  });

  it("ne recopie jamais une URL illisible, qui peut porter un mot de passe", () => {
    const libelle = libelleBase("admin:S3cret pas une url");
    expect(libelle).toMatch(/DATABASE_URL illisible/);
    expect(libelle).not.toContain("S3cret");
  });
});

describe("modeEcriture annonce la base visée en première ligne", () => {
  const argvOrigine = process.argv;
  const urlOrigine = process.env.DATABASE_URL;

  afterEach(() => {
    process.argv = argvOrigine;
    // Affecter undefined à process.env y écrirait la chaîne « undefined ».
    if (urlOrigine === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = urlOrigine;
    vi.restoreAllMocks();
  });

  function premiereLigne(argv: string[]): { ecriture: boolean; ligne: string } {
    process.argv = ["node", "script.ts", ...argv];
    process.env.DATABASE_URL = "postgresql://postgres:S3cret@localhost:5433/suivi_maintenance_dev";
    const affichage = vi.spyOn(console, "log").mockImplementation(() => {});
    const ecriture = modeEcriture();
    return { ecriture, ligne: String(affichage.mock.calls[0]?.[0] ?? "") };
  }

  it("en dry-run : la base et le mode, sans le mot de passe", () => {
    const { ecriture, ligne } = premiereLigne([]);
    expect(ecriture).toBe(false);
    expect(ligne).toMatch(/^Base : localhost:5433\/suivi_maintenance_dev — DRY-RUN/);
    expect(ligne).not.toContain("S3cret");
  });

  it("avec --confirmer aussi : c'est là que se tromper de base coûte", () => {
    const { ecriture, ligne } = premiereLigne(["--confirmer"]);
    expect(ecriture).toBe(true);
    expect(ligne).toMatch(/^Base : localhost:5433\/suivi_maintenance_dev — ÉCRITURE/);
    expect(ligne).not.toContain("S3cret");
  });
});

// Test-verrou : la ligne de la base vit dans modeEcriture(), elle ne sort en
// tête du rapport que si le script l'appelle avant tout autre affichage.
// Est un script de données tout scripts/*.ts qui touche la base, directement
// ou par un module de scripts/lib/ (un script de démo passe par là). Le verrou lit
// le texte, pas l'exécution : il vise l'oubli d'un script copié, pas la ruse.
const DOSSIER_SCRIPTS = path.resolve(__dirname, "../scripts");
const IMPORT_DE_LA_BASE = /(src|@)\/lib\/db\//;

function toucheLaBase(source: string): boolean {
  if (IMPORT_DE_LA_BASE.test(source)) return true;
  const modulesLocaux = [...source.matchAll(/from ["']\.\/lib\/([\w-]+)["']/g)].map((m) => m[1]);
  return modulesLocaux.some((nom) =>
    IMPORT_DE_LA_BASE.test(readFileSync(path.join(DOSSIER_SCRIPTS, "lib", `${nom}.ts`), "utf-8"))
  );
}

function annonceSaBaseEnTete(source: string): boolean {
  const appel = source.indexOf("modeEcriture()");
  const premierAffichage = source.indexOf("console.log(");
  return appel !== -1 && (premierAffichage === -1 || appel < premierAffichage);
}

describe("verrou : chaque script de données appelle modeEcriture() avant d'afficher quoi que ce soit", () => {
  it("attrape un script qui affiche avant modeEcriture() ou qui ne l'appelle pas", () => {
    expect(annonceSaBaseEnTete(`console.log("Dates…");\nconst ecriture = modeEcriture();`)).toBe(false);
    expect(annonceSaBaseEnTete(`const ecriture = drapeauPresent("confirmer");`)).toBe(false);
    expect(annonceSaBaseEnTete(`const ecriture = modeEcriture();\nconsole.log("Dates…");`)).toBe(true);
  });

  it("vaut pour tous les scripts de scripts/ qui touchent la base", () => {
    const scripts = readdirSync(DOSSIER_SCRIPTS).filter((nom) => nom.endsWith(".ts"));
    // Sans script lu, le verrou passerait sans rien vérifier. Un script de
    // données, lui, peut manquer : une appli assemblée sans la brique rgpd n'en
    // reçoit aucun (l'import d'exemple reste au catalogue) avant d'écrire le sien.
    expect(scripts.length).toBeGreaterThan(0);
    const scriptsDeDonnees = scripts.filter((nom) =>
      toucheLaBase(readFileSync(path.join(DOSSIER_SCRIPTS, nom), "utf-8"))
    );
    const fautifs = scriptsDeDonnees.filter(
      (nom) => !annonceSaBaseEnTete(readFileSync(path.join(DOSSIER_SCRIPTS, nom), "utf-8"))
    );
    expect(fautifs).toEqual([]);
  });
});
