import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou : le kit tient sa propre règle (CLAUDE.md §1). Aucune couleur,
 * police ni rayon en dur dans les feuilles de style de src/ui/ : tout passe
 * par les tokens de src/ui/theme/tokens.css, seule façon de thématiser les
 * couleurs, polices et formes d'un client. L'audit avant publication avait
 * trouvé cinq rayons en px et un
 * `#fff` dans le kit même qui interdit aux pages d'en écrire.
 *
 * Seule exception : les COULEURS de la signature Solstice Lab, volontairement
 * hors thème ; ses rayons et ses polices suivent la règle. Restent permises
 * les formes qui ne sont pas un choix de charte : le cercle (50 %) et la
 * pilule (999px).
 */

const DOSSIER_KIT = path.join(process.cwd(), "src", "ui");
const DEBUT_SIGNATURE = "/* ---------- Signature Solstice Lab";

// Les feuilles du kit, hors du thème (tokens.css porte les valeurs, c'est son rôle).
function feuillesDuKit(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return entree.name === "theme" ? [] : feuillesDuKit(chemin);
    return entree.name.endsWith(".css") ? [chemin] : [];
  });
}

function sectionSignature(css: string): { avant: string; signature: string; apres: string } {
  const debut = css.indexOf(DEBUT_SIGNATURE);
  if (debut === -1) return { avant: css, signature: "", apres: "" };
  const suite = css.indexOf("/* ----------", debut + DEBUT_SIGNATURE.length);
  const fin = suite === -1 ? css.length : suite;
  return { avant: css.slice(0, debut), signature: css.slice(debut, fin), apres: css.slice(fin) };
}

const COULEUR_EN_DUR =
  /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|(^|[\s,])(white|black|red|green|blue|gray|grey|silver|orange|yellow|navy)\b/i;

function ecartsDeDeclarations(css: string, couleursPermises: boolean): string[] {
  const ecarts: string[] = [];
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, propriete, valeur] of sansCommentaires.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
    const declaration = `${propriete}: ${valeur.trim()}`;
    if (!couleursPermises && !propriete.startsWith("--") && COULEUR_EN_DUR.test(valeur)) {
      ecarts.push(`couleur en dur : ${declaration}`);
    }
    if (/radius$/.test(propriete) && /\d(px|r?em|%)/.test(valeur.replace(/\b999px\b|\b50%/g, ""))) {
      ecarts.push(`rayon en dur : ${declaration}`);
    }
    if (
      (propriete === "font-family" || propriete === "font") &&
      !/^(inherit|var\(--police-[a-z]+\))$/.test(valeur.trim())
    ) {
      ecarts.push(`police en dur : ${declaration}`);
    }
  }
  return ecarts;
}

function ecartsAuxTokens(css: string): string[] {
  const { avant, signature, apres } = sectionSignature(css.replace(/\r\n/g, "\n"));
  return [...ecartsDeDeclarations(avant + apres, false), ...ecartsDeDeclarations(signature, true)];
}

describe("kit UI : rien en dur hors des tokens", () => {
  it("les feuilles de src/ui/ ne portent ni couleur, ni rayon, ni police en dur (cinq rayons et un #fff trouvés à l'audit)", () => {
    const feuilles = feuillesDuKit(DOSSIER_KIT);
    expect(feuilles.length).toBeGreaterThan(0);
    const ecarts = feuilles.flatMap((feuille) =>
      ecartsAuxTokens(fs.readFileSync(feuille, "utf-8")).map(
        (ecart) => `${path.relative(process.cwd(), feuille)} : ${ecart}`
      )
    );
    expect(ecarts).toEqual([]);
  });

  it("attrape une couleur, un rayon ou une police en dur, et ne laisse passer que les couleurs de la signature, le cercle et la pilule", () => {
    const fautif = [
      ".a { color: #fff; border-radius: 3px; }",
      ".b { background: rgb(0 0 0); font-family: Arial, sans-serif; }",
      ".c { border-radius: 50%; border-radius: 999px; color: var(--texte); box-shadow: 0 0 2px color-mix(in srgb, var(--texte) 20%, transparent) }",
      ".d { border-top-left-radius: 0.4rem; font: 12px Arial; color: red }",
      `${DEBUT_SIGNATURE} ---------- */`,
      ".sl-signature-logo { background: #ffc72c; border-radius: 4px; }",
      "/* ---------- Suite ---------- */",
      ".e { border-radius: 2px 4px; }",
    ].join("\n");
    expect(ecartsAuxTokens(fautif)).toEqual([
      "couleur en dur : color: #fff",
      "rayon en dur : border-radius: 3px",
      "couleur en dur : background: rgb(0 0 0)",
      "police en dur : font-family: Arial, sans-serif",
      "rayon en dur : border-top-left-radius: 0.4rem",
      "police en dur : font: 12px Arial",
      "couleur en dur : color: red",
      "rayon en dur : border-radius: 2px 4px",
      "rayon en dur : border-radius: 4px",
    ]);
  });
});
