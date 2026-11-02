import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou des polices. next/font/google télécharge les
 * fichiers chez Google à chaque build : quand ce téléchargement échouait chez
 * le runner, le build échouait sans rapport avec le diff (constaté
 * sur plusieurs CI). Les polices sont donc des fichiers du
 * dépôt, chargés par next/font/local ; ce test empêche d'y revenir, par
 * inattention ou par un client dont on recopie le thème.
 *
 * Seul un IMPORT est interdit : un commentaire peut nommer next/font/google
 * pour expliquer pourquoi on ne l'emploie pas.
 */

const RACINE = process.cwd();
const SRC = path.join(RACINE, "src");
const DOSSIER_POLICES = path.join(SRC, "ui", "theme", "polices");

const EXTENSIONS_DE_CODE = /\.(?:[cm]?[jt]sx?|css)$/;

// import … from "…", import "…", import("…") et require("…").
const IMPORT_GOOGLE = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']next\/font\/google["']/;

function fichiersDe(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    return entree.isDirectory() ? fichiersDe(chemin) : [chemin];
  });
}

function importeLesPolicesGoogle(source: string): boolean {
  return IMPORT_GOOGLE.test(source);
}

describe("polices servies depuis le dépôt", () => {
  it("attrape un import de next/font/google, sous toutes ses formes (le garde ci-dessous ne vaut que s'il voit le cas fautif)", () => {
    expect(importeLesPolicesGoogle(`import { IBM_Plex_Sans } from "next/font/google";`)).toBe(true);
    expect(importeLesPolicesGoogle(`import {\n  Inter,\n} from 'next/font/google'`)).toBe(true);
    expect(importeLesPolicesGoogle(`import "next/font/google";`)).toBe(true);
    expect(importeLesPolicesGoogle(`const { Inter } = require("next/font/google");`)).toBe(true);
    expect(importeLesPolicesGoogle(`const m = await import("next/font/google");`)).toBe(true);
  });

  it("laisse passer next/font/local et un commentaire qui nomme next/font/google", () => {
    expect(importeLesPolicesGoogle(`import localFont from "next/font/local";`)).toBe(false);
    expect(importeLesPolicesGoogle(`// next/font/google télécharge chez Google à chaque build`)).toBe(false);
  });

  it("n'importe next/font/google nulle part dans src/ : le build ne doit rien télécharger chez Google", () => {
    const fautifs = fichiersDe(SRC)
      .filter((chemin) => EXTENSIONS_DE_CODE.test(chemin))
      .filter((chemin) => importeLesPolicesGoogle(fs.readFileSync(chemin, "utf-8")))
      .map((chemin) => path.relative(RACINE, chemin));
    expect(fautifs).toEqual([]);
  });

  it("garde dans le dépôt chaque fichier de police cité par layout.tsx, et la licence qui l'accompagne", () => {
    const layout = fs.readFileSync(path.join(SRC, "app", "layout.tsx"), "utf-8");
    const cites = [...layout.matchAll(/path:\s*["']([^"']+\.woff2)["']/g)].map((m) => m[1]);
    expect(cites.length).toBeGreaterThan(0);
    for (const cite of cites) {
      const fichier = path.resolve(SRC, "app", cite);
      expect(fs.existsSync(fichier), cite).toBe(true);
      // Ils doivent rester sous src/ui/theme/polices/, à côté de leur licence.
      expect(path.dirname(fichier), cite).toBe(DOSSIER_POLICES);
    }
    // Le nom varie d'une fonderie à l'autre (OFL, Apache…) : une licence, quelle qu'elle soit.
    expect(fs.readdirSync(DOSSIER_POLICES).some((nom) => /^licen[cs]e/i.test(nom))).toBe(true);
  });
});
