import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LIEUX_DEPLOIEMENT } from "@/briques/deploiement/confidentialite";
import { CONFIDENTIALITE, champsManquants, lieuDe, traitements } from "@/lib/confidentialite";

/*
 * Test-verrou de la brique déploiement. Chaque cas tient un
 * piège déjà payé sur un projet précédent (socle.md), ou constaté à l'essai
 * réel sur Render : un
 * hébergeur qui déployait main sans attendre la CI, une base gratuite
 * supprimée au bout de 30 jours, une région américaine migrée vers Francfort
 * après coup, une variable lue par l'appli mais jamais déclarée chez
 * l'hébergeur.
 *
 * Lecture du texte, sans paquet YAML : chaque paquet ajouté passe par l'audit
 * de la CI, et les deux fichiers sont courts. Le cœur (le job deployer de
 * ci.yml) ne nomme pas l'hébergeur ; render.yaml est l'adaptateur Render, à
 * remplacer seul pour déployer ailleurs (README de la brique).
 */

const RACINE = process.cwd();
const lire = (fichier: string) => fs.readFileSync(path.join(RACINE, fichier), "utf-8").replace(/\r\n/g, "\n");

const CI = lire(".github/workflows/ci.yml");
const RENDER = lire("render.yaml");

function jobDeployer(ci: string): string {
  const debut = ci.indexOf("  # Brique déploiement (src/briques/deploiement/).");
  const fin = ci.indexOf("  # Fin de la brique déploiement.");
  if (debut === -1 || fin === -1) throw new Error("ci.yml : bornes de la brique déploiement introuvables");
  return ci.slice(debut, fin);
}

function etapes(job: string): Map<string, string> {
  const morceaux = job.split(/\n(?=      - name: )/).slice(1);
  return new Map(morceaux.map((morceau) => [morceau.match(/- name: (.+)/)![1].trim(), morceau]));
}

const ADAPTATEUR = "Déclencher (adaptateur Render)";

/*
 * Les variables de .env.example (commentées comprises : COMMIT_DEPLOYE l'est)
 * que render.yaml ne déclare pas. Une variable lue par l'appli et absente
 * chez l'hébergeur ne se voit qu'en production.
 */
const EXEMPTEES: Record<string, string> = {
  // Le chemin d'un CA, posé seulement si celui de l'hébergeur manque aux CA que Node reconnaît.
  PGSSLROOTCERT: "posée au besoin",
  // Posée par le startCommand depuis RENDER_GIT_COMMIT, pas déclarée.
  COMMIT_DEPLOYE: "posée au démarrage",
};

function variablesNonDeclarees(envExample: string, renderYaml: string): string[] {
  const lues = [...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
  const declarees = new Set([...renderYaml.matchAll(/^\s*- key: ([A-Z][A-Z0-9_]*)\s*$/gm)].map((m) => m[1]));
  return lues.filter((nom) => !declarees.has(nom) && !(nom in EXEMPTEES));
}

describe("ci.yml : le job deployer, cœur neutre de la brique", () => {
  const job = jobDeployer(CI);

  it("ne part qu'après le job de vérification vert : l'hébergeur déployait main sans attendre la CI", () => {
    expect(job).toMatch(/^    needs: verifier$/m);
  });

  it("ne part que sur un push de main, et se saute tant que DEPLOIEMENT_URL n'existe pas (le catalogue n'est hébergé nulle part)", () => {
    expect(job).toMatch(
      /^    if: github\.ref == 'refs\/heads\/main' && github\.event_name == 'push' && vars\.DEPLOIEMENT_URL != ''$/m
    );
  });

  it("ne lance jamais deux déploiements à la fois ni n'en annule un en cours", () => {
    expect(job).toMatch(/group: deploiement/);
    expect(job).toMatch(/cancel-in-progress: false/);
  });

  it("déclenche le commit vérifié, pas la tête de main au moment de l'appel", () => {
    const declencher = etapes(job).get(ADAPTATEUR);
    expect(declencher, `étape « ${ADAPTATEUR} » absente`).toBeDefined();
    expect(declencher).toMatch(/--url-query "ref=\$COMMIT"/);
    expect(declencher).toMatch(/COMMIT: \$\{\{ github\.sha \}\}/);
  });

  it("attend sur /sante que le commit en ligne soit celui de la CI, et échoue sinon", () => {
    const attendre = etapes(job).get("Attendre ce commit sur /sante");
    expect(attendre).toBeDefined();
    expect(attendre).toMatch(/\/sante/);
    expect(attendre).toMatch(/jq -r '\.commit/);
    expect(attendre).toMatch(/\[ "\$en_ligne" = "\$COMMIT" \] && exit 0/);
    expect(attendre).toMatch(/COMMIT: \$\{\{ github\.sha \}\}/);
    expect(attendre).toMatch(/exit 1/);
  });

  it("ne nomme l'hébergeur que dans l'étape adaptateur : déployer ailleurs ne change qu'elle", () => {
    const horsAdaptateur = [...etapes(job)].filter(([nom]) => nom !== ADAPTATEUR).map(([, texte]) => texte);
    const entete = job.slice(0, job.indexOf("      - name: "));
    for (const texte of [entete, ...horsAdaptateur]) expect(texte).not.toMatch(/render/i);
  });

  it("aucun working-directory au niveau du workflow : le job sans checkout le suivait vers un dossier absent", () => {
    expect(CI.slice(0, CI.indexOf("\njobs:"))).not.toMatch(/working-directory/);
  });
});

describe("render.yaml : l'adaptateur Render", () => {
  it("coupe l'auto-déploiement : c'est la CI qui déploie, après la vérification", () => {
    expect(RENDER).toMatch(/^    autoDeployTrigger: "off"$/m);
    expect(RENDER).not.toMatch(/autoDeploy:/);
  });

  it("place le service ET la base à Francfort : la migration depuis une région américaine a été faite après coup", () => {
    // Chaque section exige la sienne : sans region, Render prend l'Oregon.
    const [services, databases] = RENDER.split(/^databases:$/m);
    expect(services).toMatch(/^    region: frankfurt$/m);
    if (databases !== undefined) expect(databases).toMatch(/^    region: frankfurt$/m);
    const regions = [...RENDER.matchAll(/^\s+region: (\S+)$/gm)].map((m) => m[1]);
    expect(new Set(regions)).toEqual(new Set(["frankfurt"]));
  });

  it("n'utilise jamais le palier gratuit : la base gratuite est supprimée au bout de 30 jours, le web gratuit s'endort", () => {
    expect(RENDER).not.toMatch(/plan: ["']?free/);
  });

  it("sonde /sante, ouverte sans session", () => {
    expect(RENDER).toMatch(/^    healthCheckPath: \/sante$/m);
  });

  it("recopie RENDER_GIT_COMMIT dans COMMIT_DEPLOYE au démarrage : sans elle, /sante répond « inconnu » et la CI attend en vain", () => {
    expect(RENDER).toMatch(/^    startCommand: .*COMMIT_DEPLOYE="\$RENDER_GIT_COMMIT".*npm start/m);
  });

  it("ne garde que les dépendances de production après le build", () => {
    expect(RENDER).toMatch(/^    buildCommand: npm ci .*&& npm run build && npm prune --omit=dev\b/m);
  });

  it("ne pose pas NODE_ENV : posé au build, npm ci sauterait typescript et next build échouerait", () => {
    expect(RENDER).not.toMatch(/key: NODE_ENV/);
  });

  it("fait générer AUTH_SECRET par l'hébergeur, jamais écrit dans le dépôt", () => {
    expect(RENDER).toMatch(/- key: AUTH_SECRET\n\s+generateValue: true/);
  });

  it("aligne Node sur la CI", () => {
    const ci = CI.match(/node-version: "(\d+)"/)?.[1];
    expect(RENDER).toMatch(new RegExp(`- key: NODE_VERSION\\n\\s+value: "${ci}"`));
  });

  // Sans la brique données, l'assembleur du catalogue retire ce cas avec la
  // base des deux fichiers.
  it("aligne la version de Postgres sur celle de la CI", () => {
    const prod = RENDER.match(/postgresMajorVersion: "(\d+)"/)?.[1];
    expect(prod, "postgresMajorVersion absent de render.yaml").toBeDefined();
    expect(prod).toBe(CI.match(/IMAGE: postgres:(\d+)/)?.[1]);
  });

  it("déclare chaque variable de .env.example, sauf les exemptées avec leur raison", () => {
    expect(variablesNonDeclarees(lire(".env.example"), RENDER)).toEqual([]);
  });

  it("le verrou attrape une variable ajoutée à .env.example et oubliée dans render.yaml", () => {
    const envFautif = "# Une clé de plus.\nNOUVELLE_CLE=factice\n# COMMIT_DEPLOYE=\n";
    expect(variablesNonDeclarees(envFautif, "    envVars:\n      - key: AUTRE\n        sync: false\n")).toEqual([
      "NOUVELLE_CLE",
    ]);
  });
});

// La politique de confidentialité dit où l'hébergeur traite les
// données (la région de render.yaml, pas une valeur saisie à côté) et qui se
// tient devant lui.
describe("hébergeur et sous-traitants placés devant lui dans la politique de confidentialité", () => {
  it("dit Francfort, la région de render.yaml, et ne le réclame plus à la configuration", () => {
    expect(RENDER).toMatch(/^    region: frankfurt$/m);
    expect(LIEUX_DEPLOIEMENT.hebergeur).toMatch(/Francfort/);
    // Cloudflare a son propre lieu, réclamé à la configuration (cas suivant).
    const sansLieu = {
      ...CONFIDENTIALITE,
      lieux: { ...CONFIDENTIALITE.lieux, hebergeur: "", cloudflare: "Lieu factice" },
    };
    expect(lieuDe({ cle: "hebergeur", nom: "Render", role: "Hébergement." }, sansLieu)).toBe(
      LIEUX_DEPLOIEMENT.hebergeur
    );
    expect(
      champsManquants(sansLieu)
        .map((champ) => champ.libelle)
        .filter((libelle) => libelle.startsWith("Hébergement du site : lieu"))
    ).toEqual([]);
  });

  // À l'essai réel sur Render, le 2026-11-05, chaque réponse portait
  // « server: cloudflare » et un « cf-ray », et Cloudflare refusait lui-même un
  // CF-Connecting-IP envoyé à la main : il reçoit l'adresse IP de chaque
  // visiteur avant Render, et la politique ne le nommait pas.
  it("nomme Cloudflare, placé devant Render, parmi les sous-traitants de l'hébergement, et réclame son lieu à la configuration", () => {
    const hebergement = traitements().find((traitement) => traitement.cle === "hebergement");
    expect(hebergement?.sousTraitants.map((sousTraitant) => sousTraitant.nom)).toContain("Cloudflare, Inc.");
    const sansLieu = { ...CONFIDENTIALITE, lieux: { ...CONFIDENTIALITE.lieux, cloudflare: "" } };
    expect(champsManquants(sansLieu).map((champ) => champ.libelle)).toContain(
      "Hébergement du site : lieu de traitement (Cloudflare, Inc.)"
    );
  });
});
