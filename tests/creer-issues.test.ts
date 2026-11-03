import { describe, expect, it } from "vitest";
import { creerLesIssues, ErreurIssues, executer, lireLesEtapes, planDesIssues } from "../outils/creer-issues.mjs";

/*
 * Test-verrou de l'outil qui transforme la section 9 d'une blueprint en issues
 * GitHub. Aucun appel à GitHub : `gh` est une fonction qu'on lui passe.
 * Cas d'origine : le 2026-11-03, après l'assemblage de tours-de-coloc, la
 * section 9 est devenue des issues par un script jetable, sans contrôle des
 * numéros annoncés par les lignes « Bloqué par ».
 */

const DEPOT = "solstice-lab/tours-de-coloc";

const BLUEPRINT = `---
format: 1
appli: tours-de-coloc
---

# Blueprint : tours-de-coloc

## 8. Questions ouvertes

### 9.9 Ceci n'est pas une étape : il est avant la section 9

## 9. Pour poursuivre

Chaque étape est un ticket, dans cet ordre.

### 9.1 Socle prêt pour la prod

Renommer \`NOM_APP\`, vérifier \`src/lib/format.ts\`.

Deuxième paragraphe du contenu.

Vérifiable à l'écran : le titre de l'onglet porte le nom de l'appli.
Bloqué par : aucune

### 9.2 Entrée ouverte

Poser \`ouverte: true\` dans \`ENTREE\`.

Vérifiable à l'écran : /connexion accepte une adresse inconnue.

Bloqué par : 9.1

### 9.3 Créer une coloc

Entités colocation et adhésion.

Vérifiable à l'écran : l'écran « Ma coloc » s'ouvre après la création.
Bloqué par : 9.1, 9.2

## 10. Annexe

### 9.4 Ni celle-ci : elle suit la section 9
`;

// Un faux gh : numéros d'issues qui se suivent depuis \`dernier + 1\`, sauf
// ceux qu'on lui dit de sauter (quelqu'un d'autre ouvre un ticket en même temps).
function fauxGh({
  dernier = 11,
  titresOuverts = [] as string[],
  saute = [] as number[],
}: { dernier?: number; titresOuverts?: string[]; saute?: number[] } = {}) {
  const appels: { args: string[]; entree?: string }[] = [];
  let courant = dernier;
  const gh = (args: string[], entree?: string) => {
    appels.push({ args, entree });
    if (args[0] === "api") return `${courant}\n`;
    if (args[0] === "issue" && args[1] === "list") return JSON.stringify(titresOuverts.map((title) => ({ title })));
    if (args[0] === "issue" && args[1] === "create") {
      courant += 1;
      while (saute.includes(courant)) courant += 1;
      return `https://github.com/${DEPOT}/issues/${courant}\n`;
    }
    throw new Error(`commande gh inattendue : ${args.join(" ")}`);
  };
  const creations = () => appels.filter((appel) => appel.args[0] === "issue" && appel.args[1] === "create");
  return { gh, appels, creations };
}

function sortieDe(argv: string[], gh: (args: string[], entree?: string) => string) {
  const lignes: string[] = [];
  executer(argv, { gh, ecrire: (ligne: string) => lignes.push(ligne) });
  return lignes.join("\n");
}

describe("lecture de la section 9", () => {
  it("lit titre, contenu, vérifiable à l'écran et dépendances de chaque étape, sans sortir de la section 9", () => {
    const etapes = lireLesEtapes(BLUEPRINT);
    expect(etapes.map((e: { reference: string }) => e.reference)).toEqual(["9.1", "9.2", "9.3"]);
    expect(etapes[0].titre).toBe("Socle prêt pour la prod");
    expect(etapes[0].contenu).toContain("Renommer `NOM_APP`");
    expect(etapes[0].contenu).toContain("Deuxième paragraphe du contenu.");
    expect(etapes[0].contenu).not.toContain("Vérifiable");
    expect(etapes[0].verifiable).toBe("le titre de l'onglet porte le nom de l'appli.");
    expect(etapes[0].bloquePar).toEqual([]);
    expect(etapes[1].bloquePar).toEqual([1]);
    expect(etapes[2].bloquePar).toEqual([1, 2]);
  });

  it("refuse une section 9 faite d'une liste numérotée : l'outil ne lit que les étapes « ### 9.n Titre »", () => {
    const ancien = "## 9. Pour poursuivre\n\n1. **Socle prêt** : renommer.\n2. **Entrée ouverte** : poser.\n";
    expect(() => lireLesEtapes(ancien)).toThrow(/aucune étape/);
  });

  it("refuse une blueprint sans section 9", () => {
    expect(() => lireLesEtapes("## 8. Questions ouvertes\n\nRien.\n")).toThrow(/section 9/);
  });

  it("refuse des numéros d'étape qui ne se suivent pas depuis 9.1", () => {
    const texte = BLUEPRINT.replace("### 9.2 Entrée ouverte", "### 9.5 Entrée ouverte");
    expect(() => lireLesEtapes(texte)).toThrow(/9\.5.*9\.2/s);
  });

  it("refuse une étape qui dépend d'elle-même, d'une suivante ou d'une étape qui n'existe pas", () => {
    for (const faute of ["9.2", "9.3", "9.8"]) {
      const texte = BLUEPRINT.replace("Bloqué par : 9.1\n", `Bloqué par : ${faute}\n`);
      expect(() => lireLesEtapes(texte), faute).toThrow(/Bloqué par/);
    }
  });

  it("refuse une dépendance écrite en prose : « aucune » ou des références 9.n séparées par des virgules", () => {
    const texte = BLUEPRINT.replace("Bloqué par : 9.1\n", "Bloqué par : le socle\n");
    expect(() => lireLesEtapes(texte)).toThrow(/9\.2.*Bloqué par/s);
  });

  it("signale d'un coup tous les champs manquants, étape par étape", () => {
    const texte = BLUEPRINT.replace(/Vérifiable à l'écran : [^\n]*\n/g, "").replace("Bloqué par : 9.1\n", "");
    let message = "";
    try {
      lireLesEtapes(texte);
    } catch (erreur) {
      message = (erreur as Error).message;
    }
    expect(message).toMatch(/9\.1 : .*Vérifiable/);
    expect(message).toMatch(/9\.2 : .*Vérifiable/);
    expect(message).toMatch(/9\.2 : .*Bloqué par/);
    expect(message).toMatch(/9\.3 : .*Vérifiable/);
  });

  it("refuse une étape sans contenu et deux étapes au même titre (le contrôle des doublons se fait sur le titre)", () => {
    const sansContenu = BLUEPRINT.replace(/Poser `ouverte: true` dans `ENTREE`.\n\n/, "");
    expect(() => lireLesEtapes(sansContenu)).toThrow(/9\.2.*contenu/s);
    const doublon = BLUEPRINT.replace("### 9.2 Entrée ouverte", "### 9.2 Socle prêt pour la prod");
    expect(() => lireLesEtapes(doublon)).toThrow(/même titre/);
  });

  it("reconnaît les champs avec l'apostrophe typographique, en liste ou en gras (un texte français les amène)", () => {
    const texte = BLUEPRINT.replace(
      "Vérifiable à l'écran : le titre de l'onglet porte le nom de l'appli.\nBloqué par : aucune",
      "- **Vérifiable à l’écran** : le titre de l'onglet porte le nom de l'appli.\n- **Bloqué par :** aucune"
    );
    const [premiere] = lireLesEtapes(texte);
    expect(premiere.verifiable).toBe("le titre de l'onglet porte le nom de l'appli.");
    expect(premiere.bloquePar).toEqual([]);
  });

  it("ne lit pas un bloc de code : un titre, un « ## » ou un champ qui s'y trouve reste du contenu", () => {
    const texte = BLUEPRINT.replace(
      "Deuxième paragraphe du contenu.",
      "```markdown\n## 9. Autre\n\n### 9.7 Titre d'exemple\n\nBloqué par : 9.4\n```\n\nDeuxième paragraphe du contenu."
    );
    const etapes = lireLesEtapes(texte);
    expect(etapes.map((e: { reference: string }) => e.reference)).toEqual(["9.1", "9.2", "9.3"]);
    expect(etapes[0].contenu).toContain("### 9.7 Titre d'exemple");
    expect(etapes[0].contenu).toContain("Bloqué par : 9.4");
    expect(etapes[0].bloquePar).toEqual([]);
  });

  it("n'est pas dérouté par un sous-titre d'une autre forme dans le contenu d'une étape", () => {
    const texte = BLUEPRINT.replace(
      "Deuxième paragraphe du contenu.",
      "#### Détail\n\nDeuxième paragraphe du contenu."
    );
    expect(lireLesEtapes(texte)[0].contenu).toContain("#### Détail");
  });
});

describe("corps des issues", () => {
  const etapes = lireLesEtapes(BLUEPRINT);

  it("annonce les numéros d'issue qui se suivent depuis le suivant du dépôt, dans la ligne « Bloqué par »", () => {
    const plan = planDesIssues(etapes, { premierNumero: 12 });
    expect(plan.map((p: { issue: number }) => p.issue)).toEqual([12, 13, 14]);
    expect(plan[0].corps).not.toMatch(/Bloqué par/);
    expect(plan[1].corps).toMatch(/^Bloqué par #12$/m);
    expect(plan[2].corps).toMatch(/^Bloqué par #12, #13$/m);
  });

  it("donne un corps par étape : le contenu, le vérifiable à l'écran et le renvoi vers sa section de la blueprint", () => {
    const [premiere] = planDesIssues(etapes, { premierNumero: 12 });
    expect(premiere.titre).toBe("Socle prêt pour la prod");
    expect(premiere.corps).toContain("Renommer `NOM_APP`");
    expect(premiere.corps).toContain("**Vérifiable à l'écran** : le titre de l'onglet porte le nom de l'appli.");
    expect(premiere.corps).toContain("`blueprint.md`, section 9, étape 9.1");
  });
});

describe("création", () => {
  const plan = planDesIssues(lireLesEtapes(BLUEPRINT), { premierNumero: 12 });

  it("crée les issues dans l'ordre, dans le dépôt donné, le corps passé par l'entrée standard", () => {
    const { gh, creations } = fauxGh();
    const crees = creerLesIssues({ plan, gh, depot: DEPOT });
    expect(crees.map((c: { issue: number }) => c.issue)).toEqual([12, 13, 14]);
    expect(creations().map((c) => c.args)).toEqual(
      plan.map((p: { titre: string }) => ["issue", "create", "--repo", DEPOT, "--title", p.titre, "--body-file", "-"])
    );
    expect(creations().map((c) => c.entree)).toEqual(plan.map((p: { corps: string }) => p.corps));
  });

  it("s'arrête net au premier numéro qui s'écarte de celui annoncé, sans créer la suite, et dit quoi faire", () => {
    // Quelqu'un ouvre un ticket entre la 2e et la 3e issue : la 3e prend le #15, pas le #14.
    const { gh, creations } = fauxGh({ saute: [14] });
    let erreur: Error | undefined;
    try {
      creerLesIssues({ plan, gh, depot: DEPOT });
    } catch (e) {
      erreur = e as Error;
    }
    expect(erreur).toBeInstanceOf(ErreurIssues);
    expect(creations()).toHaveLength(3);
    expect(erreur?.message).toContain("#15");
    expect(erreur?.message).toContain("#14");
    expect(erreur?.message).toMatch(/gh issue close/);
    expect(erreur?.message).toMatch(/#12/);
  });

  it("garde la liste des issues déjà créées quand gh échoue en cours de route (réseau, quota)", () => {
    const { gh: ghSain } = fauxGh();
    let creations = 0;
    const gh = (args: string[], entree?: string) => {
      if (args[1] === "create" && ++creations === 2) throw new ErreurIssues("gh issue create a échoué : quota");
      return ghSain(args, entree);
    };
    expect(() => creerLesIssues({ plan, gh, depot: DEPOT })).toThrow(/quota.*#12 \(9\.1\)/s);
  });

  it("s'arrête dès la première issue si son numéro n'est pas le suivant du dépôt (un ticket supprimé laisse un trou)", () => {
    const { gh, creations } = fauxGh({ saute: [12] });
    expect(() => creerLesIssues({ plan, gh, depot: DEPOT })).toThrow(/#13.*#12/s);
    expect(creations()).toHaveLength(1);
  });
});

describe("commande", () => {
  const lire = () => BLUEPRINT;

  it("tourne à blanc par défaut : affiche titres, corps et dépendances, ne crée rien", () => {
    const { gh, appels, creations } = fauxGh();
    const lignes: string[] = [];
    executer(["--blueprint", "blueprint.md", "--depot", DEPOT], {
      gh,
      lireBlueprint: lire,
      ecrire: (ligne: string) => lignes.push(ligne),
    });
    const sortie = lignes.join("\n");
    expect(creations()).toHaveLength(0);
    expect(appels.every((a) => a.args[0] === "api" || (a.args[0] === "issue" && a.args[1] === "list"))).toBe(true);
    expect(sortie).toContain("#12");
    expect(sortie).toContain("Socle prêt pour la prod");
    expect(sortie).toContain("Bloqué par #12, #13");
    expect(sortie).toMatch(/à blanc/i);
    expect(sortie).toContain("--confirmer");
  });

  it("crée avec le drapeau de confirmation et rapporte chaque numéro", () => {
    const { gh, creations } = fauxGh();
    const lignes: string[] = [];
    executer(["--blueprint", "blueprint.md", "--depot", DEPOT, "--confirmer"], {
      gh,
      lireBlueprint: lire,
      ecrire: (ligne: string) => lignes.push(ligne),
    });
    expect(creations()).toHaveLength(3);
    expect(lignes.join("\n")).toMatch(/#12.*#14/s);
  });

  it("refuse de recréer des issues dont le titre existe déjà parmi les ouvertes (deuxième lancement par erreur)", () => {
    const { gh, creations } = fauxGh({ titresOuverts: ["Entrée ouverte"] });
    expect(() =>
      executer(["--blueprint", "blueprint.md", "--depot", DEPOT, "--confirmer"], {
        gh,
        lireBlueprint: lire,
        ecrire: () => {},
      })
    ).toThrow(/Entrée ouverte.*déjà/s);
    expect(creations()).toHaveLength(0);
  });

  it("n'a aucun dépôt par défaut : sans --depot, il refuse plutôt que d'écrire dans le dépôt courant", () => {
    const { gh, appels } = fauxGh();
    expect(() => executer(["--blueprint", "blueprint.md"], { gh, lireBlueprint: lire, ecrire: () => {} })).toThrow(
      /--depot/
    );
    expect(appels).toHaveLength(0);
  });

  it("ne crée jamais d'issues dans le dépôt du catalogue : elles sont celles d'une appli (à blanc, il reste lisible)", () => {
    const { gh, creations } = fauxGh();
    const contexte = { gh, lireBlueprint: lire, ecrire: () => {} };
    expect(() =>
      executer(["--blueprint", "b.md", "--depot", "solstice-lab/catalogue-solstice-vibe", "--confirmer"], contexte)
    ).toThrow(/catalogue/);
    expect(creations()).toHaveLength(0);
    expect(() =>
      executer(["--blueprint", "b.md", "--depot", "solstice-lab/catalogue-solstice-vibe"], contexte)
    ).not.toThrow();
  });

  it("refuse un dépôt mal écrit, une option inconnue et une blueprint absente", () => {
    const { gh } = fauxGh();
    const contexte = { gh, lireBlueprint: lire, ecrire: () => {} };
    expect(() => executer(["--blueprint", "b.md", "--depot", "tours"], contexte)).toThrow(/proprietaire\/nom/);
    expect(() => executer(["--blueprint", "b.md", "--depot", DEPOT, "--vite"], contexte)).toThrow(/Option inconnue/);
    expect(() => executer(["--depot", DEPOT], contexte)).toThrow(/--blueprint/);
  });

  it("dit l'aide sans appeler GitHub", () => {
    const { gh, appels } = fauxGh();
    expect(sortieDe(["--aide"], gh)).toContain("--confirmer");
    expect(appels).toHaveLength(0);
  });
});
