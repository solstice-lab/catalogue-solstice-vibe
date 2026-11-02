import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifierAudit } from "../scripts/verifier-audit.mjs";

/*
 * Vérification des vulnérabilités. Une fois accepté l'avis braces
 * GHSA-vfj7-8cjw-p6xm, haute, sans correctif publié : `npm audit` restait rouge
 * en permanence, et une nouvelle haute ou critique serait passée inaperçue
 * derrière elle. Le script lit les sorties `npm audit --json` (complète et
 * --omit=dev) ; ce test les remplace par des extraits réduits de la vraie
 * sortie du 2026-10-22, sans réseau.
 */

const RACINE = process.cwd();
const EXCEPTIONS_DU_DEPOT = fs.readFileSync(path.join(RACINE, "exceptions-audit.json"), "utf-8");

type Vulnerabilite = { name: string; severity: string; isDirect: boolean; via: unknown[]; effects: string[] };

const avis = (id: string, paquet: string, gravite: string) => ({
  source: 1,
  name: paquet,
  dependency: paquet,
  title: `Avis d'exemple sur ${paquet}`,
  url: `https://github.com/advisories/${id}`,
  severity: gravite,
  range: "*",
});

const vuln = (name: string, severity: string, via: unknown[], effects: string[], isDirect = false): Vulnerabilite => ({
  name,
  severity,
  isDirect,
  via,
  effects,
});

const sortie = (...vulnerabilites: Vulnerabilite[]) =>
  JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(vulnerabilites.map((v) => [v.name, v])),
    metadata: {},
  });

// La chaîne réelle de braces : seul le paquet braces porte l'avis, les quatre
// autres le relaient (`via` en texte), ce qui fait compter cinq hautes à npm.
const BRACES = "GHSA-vfj7-8cjw-p6xm";
const chaineBraces = (racine = "eslint-config-next") => [
  vuln(racine, "high", ["@next/eslint-plugin-next"], [], true),
  vuln("@next/eslint-plugin-next", "high", ["fast-glob"], [racine]),
  vuln("fast-glob", "high", ["micromatch"], ["@next/eslint-plugin-next"]),
  vuln("micromatch", "high", ["braces"], ["fast-glob"]),
  vuln("braces", "high", [avis(BRACES, "braces", "high")], ["micromatch"]),
];

// uuid sous exceljs : modérée, livrée en production, acceptée sans
// exception, puisqu'une modérée ne bloque pas.
const chaineUuid = () => [
  vuln("exceljs", "moderate", ["uuid"], [], true),
  vuln("uuid", "moderate", [avis("GHSA-w5hq-g745-h8pq", "uuid", "moderate")], ["exceljs"]),
];

const ETAT_ACTUEL = {
  auditComplet: sortie(...chaineBraces(), ...chaineUuid()),
  auditProduction: sortie(...chaineUuid()),
};

const exceptions = (...liste: Record<string, unknown>[]) => JSON.stringify({ exceptions: liste });
const exceptionBraces = (modifs: Record<string, unknown> = {}) => ({
  avis: BRACES,
  paquet: "braces",
  gravite: "haute",
  portee: "dev",
  raison: "Seul le lint l'exécute.",
  date: "2026-10-22",
  decision: "Acceptée par la personne responsable du projet.",
  reexamen: "Une version de braces > 3.0.3 est publiée.",
  ...modifs,
});

describe("verifierAudit : état des dépendances au 2026-10-22", () => {
  it("passe avec l'exception braces, et signale la modérée uuid sans échouer", () => {
    const resultat = verifierAudit({ ...ETAT_ACTUEL, exceptions: exceptions(exceptionBraces()) });
    expect(resultat.erreurs).toEqual([]);
    expect(resultat.signalements.join("\n")).toMatch(/GHSA-w5hq-g745-h8pq.*exceljs → uuid/);
  });

  // Forme seulement : confronter le fichier à l'état du 2026-10-22 casserait
  // ce test dans toute appli qui ajoute ou retire une exception. Que ses
  // exceptions correspondent aux vraies dépendances, c'est l'étape de la CI
  // qui le vérifie, contre le registre.
  it("lit le fichier d'exceptions du dépôt sans erreur de forme", () => {
    const { exceptions: liste } = JSON.parse(EXCEPTIONS_DU_DEPOT) as {
      exceptions: { avis: string; paquet: string; gravite: string }[];
    };
    const gravites: Record<string, string> = { haute: "high", critique: "critical" };
    const audit = sortie(
      ...liste.map((e) =>
        vuln(
          e.paquet,
          gravites[e.gravite] ?? e.gravite,
          [avis(e.avis, e.paquet, gravites[e.gravite] ?? e.gravite)],
          [],
          true
        )
      )
    );
    const resultat = verifierAudit({ auditComplet: audit, auditProduction: sortie(), exceptions: EXCEPTIONS_DU_DEPOT });
    expect(resultat.erreurs).toEqual([]);
  });

  it("passe quand seules des vulnérabilités modérées restent", () => {
    const resultat = verifierAudit({
      auditComplet: sortie(...chaineUuid()),
      auditProduction: sortie(...chaineUuid()),
      exceptions: exceptions(),
    });
    expect(resultat.erreurs).toEqual([]);
  });
});

describe("verifierAudit : échoue sur ce qui n'est pas accepté", () => {
  it("échoue sur une nouvelle vulnérabilité haute, en donnant l'avis, le paquet et la chaîne", () => {
    const resultat = verifierAudit({
      ...ETAT_ACTUEL,
      auditComplet: sortie(
        ...chaineBraces(),
        vuln("vitest", "high", ["tar"], [], true),
        vuln("tar", "high", [avis("GHSA-aaaa-bbbb-cccc", "tar", "high")], ["vitest"])
      ),
      exceptions: exceptions(exceptionBraces()),
    });
    expect(resultat.erreurs).toHaveLength(1);
    expect(resultat.erreurs[0]).toMatch(/haute.*GHSA-aaaa-bbbb-cccc.*tar.*vitest → tar/);
  });

  it("échoue sur une nouvelle vulnérabilité critique", () => {
    const resultat = verifierAudit({
      ...ETAT_ACTUEL,
      auditComplet: sortie(
        ...chaineBraces(),
        vuln("next", "critical", [avis("GHSA-dddd-eeee-ffff", "next", "critical")], [], true)
      ),
      exceptions: exceptions(exceptionBraces()),
    });
    expect(resultat.erreurs).toHaveLength(1);
    expect(resultat.erreurs[0]).toMatch(/critique.*GHSA-dddd-eeee-ffff.*next/);
  });

  it("échoue sur une exception devenue sans objet, pour qu'une exception morte ne reste pas dans le dépôt", () => {
    const resultat = verifierAudit({
      auditComplet: sortie(...chaineUuid()),
      auditProduction: sortie(...chaineUuid()),
      exceptions: exceptions(exceptionBraces()),
    });
    expect(resultat.erreurs).toHaveLength(1);
    expect(resultat.erreurs[0]).toMatch(/GHSA-vfj7-8cjw-p6xm.*sans objet/);
  });

  it("échoue quand un avis accepté pour le développement arrive dans les dépendances de production (braces tiré par une dépendance livrée)", () => {
    const resultat = verifierAudit({
      auditComplet: sortie(...chaineBraces("une-lib-livree")),
      auditProduction: sortie(...chaineBraces("une-lib-livree")),
      exceptions: exceptions(exceptionBraces()),
    });
    expect(resultat.erreurs).toHaveLength(1);
    expect(resultat.erreurs[0]).toMatch(/GHSA-vfj7-8cjw-p6xm.*production.*une-lib-livree → .* → braces/);
  });

  it("accepte en production un avis dont l'exception porte la portée production", () => {
    const resultat = verifierAudit({
      auditComplet: sortie(...chaineBraces("une-lib-livree")),
      auditProduction: sortie(...chaineBraces("une-lib-livree")),
      exceptions: exceptions(exceptionBraces({ portee: "production" })),
    });
    expect(resultat.erreurs).toEqual([]);
  });

  it.each([
    ["critical", "critique"],
    ["moderate", "modérée"],
  ])(
    "échoue quand la gravité d'un avis accepté change (vers %s) : la décision est à réexaminer",
    (gravite, libelle) => {
      const chaine = chaineBraces();
      chaine[4] = vuln("braces", gravite, [avis(BRACES, "braces", gravite)], ["micromatch"]);
      const resultat = verifierAudit({
        ...ETAT_ACTUEL,
        auditComplet: sortie(...chaine),
        exceptions: exceptions(exceptionBraces()),
      });
      expect(resultat.erreurs).toHaveLength(1);
      expect(resultat.erreurs[0]).toMatch(new RegExp(`GHSA-vfj7-8cjw-p6xm.*de haute à ${libelle}.*réexaminer`));
    }
  );
});

describe("verifierAudit : ne conclut jamais « rien trouvé » à tort", () => {
  it("échoue en disant de relancer la CI quand le registre npm est injoignable (sortie réelle de npm 11)", () => {
    const horsLigne = JSON.stringify({
      message:
        "request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed, reason: getaddrinfo ENOTFOUND",
      error: { summary: "", detail: "" },
    });
    for (const sorties of [
      { auditComplet: horsLigne, auditProduction: ETAT_ACTUEL.auditProduction },
      { auditComplet: ETAT_ACTUEL.auditComplet, auditProduction: horsLigne },
      { auditComplet: "", auditProduction: ETAT_ACTUEL.auditProduction },
    ]) {
      const resultat = verifierAudit({ ...sorties, exceptions: EXCEPTIONS_DU_DEPOT });
      expect(resultat.erreurs).toHaveLength(1);
      expect(resultat.erreurs[0]).toMatch(/registre npm injoignable, relancer la CI/);
    }
  });

  it.each([
    ["un JSON illisible", "{ exceptions: [] "],
    ["une liste absente", JSON.stringify({ autre: [] })],
    ["un champ manquant", exceptions(exceptionBraces({ raison: undefined }))],
    ["une portée inconnue", exceptions(exceptionBraces({ portee: "test" }))],
    ["une gravité qui ne bloque pas", exceptions(exceptionBraces({ gravite: "modérée" }))],
    ["une date hors format", exceptions(exceptionBraces({ date: "22/10/2026" }))],
  ])("échoue sur un fichier d'exceptions mal formé : %s", (_cas, fichier) => {
    const resultat = verifierAudit({ ...ETAT_ACTUEL, exceptions: fichier });
    expect(resultat.erreurs.length).toBeGreaterThan(0);
    expect(resultat.erreurs.join("\n")).toMatch(/exceptions-audit\.json/);
  });
});
