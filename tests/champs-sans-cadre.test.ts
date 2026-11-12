import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluerSaisie, formatDuType, FORMATS, indexDuProchain } from "@/ui/champs";

/*
 * Champs sans cadre de la charte « registre » : un champ est du texte dans sa
 * cellule, signalé par une barre d'insertion. Le 22/10/2026, une appli
 * Solstice Vibe en React a été livrée avec des champs nus : sans la barre, le
 * champ redevient invisible au repos. Ces tests verrouillent la logique du
 * composant `Champ` (formats, prochain champ) et l'interdiction d'un
 * `<input>` texte écrit hors de lui.
 */

describe("Formats contrôlés d'un champ", () => {
  it("un SIREN fait 9 chiffres, espaces tolérés ; une lettre le rend impossible dès la frappe", () => {
    expect(FORMATS.siren.ok("123 456 789")).toBe(true);
    expect(FORMATS.siren.ok("12345678")).toBe(false);
    expect(FORMATS.siren.partiel("1234")).toBe(true);
    expect(FORMATS.siren.partiel("12a")).toBe(false);
  });

  it("un code postal fait 5 chiffres", () => {
    expect(FORMATS.cp.ok("75011")).toBe(true);
    expect(FORMATS.cp.ok("7501")).toBe(false);
    expect(FORMATS.cp.partiel("750")).toBe(true);
    expect(FORMATS.cp.partiel("750112")).toBe(false);
  });

  it("une adresse e-mail en cours de frappe reste plausible tant qu'elle n'a qu'un @ et pas d'espace", () => {
    expect(FORMATS.email.ok("prenom@exemple.fr")).toBe(true);
    expect(FORMATS.email.ok("prenom@exemple")).toBe(false);
    expect(FORMATS.email.partiel("pre")).toBe(true);
    expect(FORMATS.email.partiel("prenom@exem")).toBe(true);
    expect(FORMATS.email.partiel("pre nom")).toBe(false);
    expect(FORMATS.email.partiel("a@b@c")).toBe(false);
  });

  it("un téléphone fait 10 chiffres, ou +33 et 9 chiffres", () => {
    expect(FORMATS.tel.ok("01 23 45 67 89")).toBe(true);
    expect(FORMATS.tel.ok("+33 1 23 45 67 89")).toBe(true);
    expect(FORMATS.tel.ok("01 23 45")).toBe(false);
    expect(FORMATS.tel.partiel("+33 1")).toBe(true);
    expect(FORMATS.tel.partiel("01-x")).toBe(false);
  });

  it("une date jj/mm/aaaa doit exister au calendrier : le 31/02 est refusé dès qu'il est tapé", () => {
    expect(FORMATS.date.ok("29/02/2028")).toBe(true);
    expect(FORMATS.date.ok("29/02/2027")).toBe(false);
    expect(FORMATS.date.partiel("31/0")).toBe(true);
    expect(FORMATS.date.partiel("31/02/2026")).toBe(false);
  });

  it("entier, nombre à la française et pourcentage de 0 à 100", () => {
    expect(FORMATS.int.ok("4 280")).toBe(true);
    expect(FORMATS.int.ok("4,5")).toBe(false);
    expect(FORMATS.num.ok("4 280,5")).toBe(true);
    expect(FORMATS.num.partiel("4 280,")).toBe(true);
    expect(FORMATS.num.partiel("4a")).toBe(false);
    expect(FORMATS.pct.ok("100")).toBe(true);
    expect(FORMATS.pct.ok("100,5")).toBe(false);
    expect(FORMATS.pct.partiel("101")).toBe(false);
  });

  it("une répartition en parts séparées par / totalise 100", () => {
    expect(FORMATS.split.ok("60/40")).toBe(true);
    expect(FORMATS.split.ok("60/30")).toBe(false);
    expect(FORMATS.split.partiel("60/")).toBe(true);
    expect(FORMATS.split.partiel("60-40")).toBe(false);
  });

  it("une adresse web commence par http:// ou https:// et nomme un domaine", () => {
    expect(FORMATS.url.ok("https://solstice-lab.com")).toBe(true);
    expect(FORMATS.url.ok("solstice-lab.com")).toBe(false);
    expect(FORMATS.url.partiel("http")).toBe(true);
    expect(FORMATS.url.partiel("ftp://")).toBe(false);
  });

  it("chaque format a un message, ajouté au libellé quand la saisie est refusée", () => {
    for (const format of Object.values(FORMATS)) expect(format.message).not.toBe("");
  });
});

describe("État d'un champ selon sa saisie", () => {
  it("un champ sans format n'est jamais vert ni rouge", () => {
    expect(evaluerSaisie("n'importe quoi", undefined, "sortie")).toBe("neutre");
  });

  it("un champ vide reste neutre, même à la sortie : pas de notion d'obligatoire à la frappe", () => {
    expect(evaluerSaisie("", "email", "sortie")).toBe("neutre");
    expect(evaluerSaisie("   ", "siren", "sortie")).toBe("neutre");
  });

  it("une frappe incomplète mais plausible reste neutre : pas de rouge dès la première lettre d'un e-mail", () => {
    expect(evaluerSaisie("prenom@", "email", "frappe")).toBe("neutre");
  });

  it("une frappe qui ne peut plus devenir valide passe au rouge sans attendre la sortie", () => {
    expect(evaluerSaisie("12a", "siren", "frappe")).toBe("invalide");
  });

  it("à la sortie du champ, tout ce qui n'est pas au format passe au rouge", () => {
    expect(evaluerSaisie("prenom@", "email", "sortie")).toBe("invalide");
  });

  it("une saisie au format est valide, pendant la frappe comme à la sortie", () => {
    expect(evaluerSaisie("75011", "cp", "frappe")).toBe("valide");
    expect(evaluerSaisie("75011", "cp", "sortie")).toBe("valide");
  });

  it("le type de l'input donne son format quand l'appelant n'en précise pas", () => {
    expect(formatDuType("email")).toBe("email");
    expect(formatDuType("tel")).toBe("tel");
    expect(formatDuType("url")).toBe("url");
    expect(formatDuType("text")).toBeUndefined();
    expect(formatDuType(undefined)).toBeUndefined();
  });
});

describe("Le prochain champ à remplir", () => {
  it("est le premier champ vide de la page, et lui seul", () => {
    expect(
      indexDuProchain([
        { vide: false, candidat: true },
        { vide: true, candidat: true },
        { vide: true, candidat: true },
      ])
    ).toBe(1);
  });

  it("saute les saisies qui ne sont pas à remplir (filtre de tableau, champ désactivé)", () => {
    expect(
      indexDuProchain([
        { vide: true, candidat: false },
        { vide: true, candidat: true },
      ])
    ).toBe(1);
  });

  it("n'existe pas quand tout est rempli", () => {
    expect(indexDuProchain([{ vide: false, candidat: true }])).toBe(-1);
    expect(indexDuProchain([])).toBe(-1);
  });
});

/*
 * Test-verrou : tout `<input>` de src/ passe par src/ui/Champ.tsx, qui pose
 * la barre d'insertion sur ce qui se tape et rend en natif le reste (date,
 * nombre, mot de passe). Restent seuls permis ailleurs : caché, fichier, case
 * à cocher (ChampCase dans un formulaire), bouton radio.
 */
const FICHIER_DU_COMPOSANT = path.join("src", "ui", "Champ.tsx");
const TYPES_PERMIS = new Set(["hidden", "file", "checkbox", "radio"]);

function inputsTexteNus(source: string): string[] {
  const nus: string[] = [];
  for (const [balise] of source.matchAll(/<input\b[^>]*>/g)) {
    const type = /\btype=["{]?"?([a-z]+)/.exec(balise)?.[1];
    if (!type || !TYPES_PERMIS.has(type)) nus.push(balise.replace(/\s+/g, " "));
  }
  return nus;
}

function sourcesTsx(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return sourcesTsx(chemin);
    return entree.name.endsWith(".tsx") ? [chemin] : [];
  });
}

describe("Aucun <input> texte hors du composant Champ", () => {
  it("le détecteur attrape un input nu, avec ou sans type, et laisse passer caché, fichier, case et radio", () => {
    const fautif = `<input name="nom" />\n<input type="search" value={v} />\n<input\n  type="email"\n/>\n<input type="number" />`;
    expect(inputsTexteNus(fautif)).toHaveLength(4);
    const permis = `<input type="hidden" name="retour" value={r} />\n<input type="checkbox" checked />\n<input type="file" />`;
    expect(inputsTexteNus(permis)).toEqual([]);
  });

  it("src/ ne pose aucun input de saisie ailleurs que dans src/ui/Champ.tsx (cas du 22/10/2026 : champs nus livrés)", () => {
    const racine = path.join(process.cwd(), "src");
    const ecarts = sourcesTsx(racine)
      .filter((fichier) => path.relative(process.cwd(), fichier) !== FICHIER_DU_COMPOSANT)
      .flatMap((fichier) =>
        inputsTexteNus(fs.readFileSync(fichier, "utf-8")).map(
          (balise) => `${path.relative(process.cwd(), fichier)} : ${balise}`
        )
      );
    expect(ecarts).toEqual([]);
  });
});
