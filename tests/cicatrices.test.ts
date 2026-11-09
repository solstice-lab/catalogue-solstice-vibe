import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Test-verrou des renvois `fichier:ligne` de docs/cicatrices.md. Cas d'origine :
 * l'audit du 2026-11-09 a trouvé une vingtaine de renvois sur une ligne vide ou
 * sur une accolade, et d'autres sur une ligne voisine de leur cible : les
 * fichiers visés avaient bougé depuis l'écriture du registre, personne ne le
 * voyait. Le registre sert de mémoire des erreurs passées ; un renvoi qui ne
 * mène nulle part ne tient plus rien.
 *
 * Ce que le test garantit : chaque renvoi vise une ligne qui existe, non vide,
 * qui n'est pas qu'une fermeture (accolade, `});`, `);`, fin de commentaire). Il ne dit pas que
 * la ligne est LA bonne : cela reste une relecture (agent relecteur-docs).
 *
 * Les trois écritures du registre : `chemin/fichier.ext:12` ; `SKILL.md:12` et
 * `socle.md:12` après le nom de la skill ; `:12` seul, qui reprend le fichier
 * (ou la skill, ou l'agent) nommé juste avant dans la même ligne du tableau.
 */

const RACINE = process.cwd();
const SKILLS = path.join(".claude", "skills");

// Une ligne qui ne porte aucun contenu : vide, ou seulement des fermetures.
function estLigneVideOuFermeture(ligne: string): boolean {
  return /^[\s})\]*/;,]*$/.test(ligne);
}

type Renvoi = { ligneDuRegistre: number; fichier: string | null; ligne: number; brut: string };

// Parcourt une ligne du registre de gauche à droite : un nom de skill ou
// d'agent, ou un renvoi, qui prend son fichier dans ce qui précède.
function lireRenvois(texte: string): Renvoi[] {
  const renvois: Renvoi[] = [];
  texte.split("\n").forEach((contenu, i) => {
    let skill: string | null = null;
    let fichierCourant: string | null = null;
    const motif =
      /(solstice-[a-z-]+)|(relecteur-[a-z]+)|`?((?:[\w./[\]()-]+\.(?:tsx?|md|mjs|json|css|sql|ya?ml|js)|\.gitignore))?:(\d+)`?/g;
    for (const m of contenu.matchAll(motif)) {
      if (m[1]) {
        skill = m[1];
        fichierCourant = null;
      } else if (m[2]) {
        skill = null;
        fichierCourant = path.join(".claude", "agents", `${m[2]}.md`);
      } else {
        let fichier: string | null = m[3] ?? null;
        if (fichier === "SKILL.md" || fichier === "socle.md") {
          fichier = skill ? path.join(SKILLS, skill, fichier) : null;
        }
        if (fichier) fichierCourant = fichier;
        renvois.push({
          ligneDuRegistre: i + 1,
          fichier: fichier ?? fichierCourant ?? (skill ? path.join(SKILLS, skill, "SKILL.md") : null),
          ligne: Number(m[4]),
          brut: m[0],
        });
      }
    }
  });
  return renvois;
}

// Le motif d'un renvoi ne sait pas qu'un jour de l'heure, un port ou une
// adresse (`localhost:5433`) a la même forme : seuls les fichiers du dépôt
// comptent, un renvoi vers un fichier absent est une erreur à part entière.
function problemes(renvois: Renvoi[], lireLignes: (fichier: string) => string[] | null): string[] {
  const erreurs: string[] = [];
  for (const r of renvois) {
    const ou = `docs/cicatrices.md:${r.ligneDuRegistre}, ${r.brut.replace(/`/g, "")}`;
    if (!r.fichier) {
      erreurs.push(`${ou} : le fichier visé n'est pas nommé`);
      continue;
    }
    const lignes = lireLignes(r.fichier);
    if (!lignes) {
      erreurs.push(`${ou} : ${r.fichier} n'existe pas`);
    } else if (r.ligne < 1 || r.ligne > lignes.length) {
      erreurs.push(`${ou} : ${r.fichier} n'a que ${lignes.length} lignes`);
    } else if (estLigneVideOuFermeture(lignes[r.ligne - 1])) {
      erreurs.push(`${ou} : la ligne ${r.ligne} de ${r.fichier} est vide ou une simple fermeture`);
    }
  }
  return erreurs;
}

function lireLignesDuDepot(fichier: string): string[] | null {
  const chemin = path.join(RACINE, fichier);
  return existsSync(chemin) ? readFileSync(chemin, "utf-8").split("\n") : null;
}

describe("renvois fichier:ligne de docs/cicatrices.md", () => {
  const registre = readFileSync(path.join(RACINE, "docs", "cicatrices.md"), "utf-8");
  const renvois = lireRenvois(registre);

  it("trouve les renvois du registre (sans quoi le verrou passerait sur du vide)", () => {
    expect(renvois.length).toBeGreaterThan(100);
    expect(readdirSync(path.join(RACINE, SKILLS)).length).toBeGreaterThan(0);
  });

  it("vise partout une ligne qui existe, non vide, qui n'est pas qu'une fermeture (audit du 2026-11-09 : vingt renvois sur une ligne vide ou une accolade)", () => {
    expect(problemes(renvois, lireLignesDuDepot)).toEqual([]);
  });

  it("attrape un renvoi sur une ligne vide, sur une accolade, hors du fichier ou vers un fichier absent (cas fautifs que le verrou doit attraper)", () => {
    const faux = new Map<string, string[]>([
      ["tests/exemple.test.ts", ['it("une règle", () => {', "", "  });", "  }", "  );", " */", "fin"]],
      [path.join(SKILLS, "solstice-donnees", "SKILL.md"), ["# titre", "", "règle"]],
    ]);
    const lire = (f: string) => faux.get(f) ?? null;
    const texte = [
      "| X1 | règle | cas | `tests/exemple.test.ts:1` ; `:2` ; `:3` ; `:4` ; `:5` ; `:6` ; `:7` ; `:8` |",
      "| X2 | règle | cas | `solstice-donnees` (`SKILL.md:2`, `:3`) ; `tests/absent.test.ts:1` |",
    ].join("\n");
    const erreurs = problemes(lireRenvois(texte), lire);
    // :1 et :7 sont de vraies lignes ; :2 à :6 sont vides ou des fermetures ; :8 dépasse.
    expect(erreurs).toHaveLength(5 + 1 + 1 + 1);
    expect(erreurs.filter((e) => e.includes("vide ou une simple fermeture"))).toHaveLength(6);
    expect(erreurs.filter((e) => e.includes("n'a que"))).toHaveLength(1);
    expect(erreurs.filter((e) => e.includes("n'existe pas"))).toHaveLength(1);
  });

  it("rattache `:12` seul au fichier nommé juste avant, et `SKILL.md:12` à la skill nommée avant lui", () => {
    const renvoisLus = lireRenvois(
      "| X | r | c | `tests/a.test.ts:3`, `:9` ; `solstice-ui` (`SKILL.md:5`, `:6`) ; relecteur-docs (`:4`) |"
    );
    expect(renvoisLus.map((r) => [r.fichier, r.ligne])).toEqual([
      ["tests/a.test.ts", 3],
      ["tests/a.test.ts", 9],
      [path.join(SKILLS, "solstice-ui", "SKILL.md"), 5],
      [path.join(SKILLS, "solstice-ui", "SKILL.md"), 6],
      [path.join(".claude", "agents", "relecteur-docs.md"), 4],
    ]);
  });
});
