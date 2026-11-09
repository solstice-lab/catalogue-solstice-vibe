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
 * Ce qui, dans l'étape adaptateur, laisse un échec sans dire quoi corriger.
 * curl -f sort en erreur sous bash -e avant tout message ; curl sans -f ni
 * lecture du code HTTP prend un refus pour un succès ; une erreur qui ne
 * nomme pas le secret envoie chercher ailleurs ; un seul ::error:: (le secret
 * absent) laisse le refus de l'hébergeur muet.
 */
function echecsAnonymes(etape: string): string[] {
  const defauts: string[] = [];
  const commandes = etape.replace(/^\s*#.*$/gm, "");
  const appelsCurl = commandes.split("\n").filter((ligne) => /\bcurl\s/.test(ligne));
  for (const appel of appelsCurl) {
    if (/\s(-[a-zA-Z]*f[a-zA-Z]*|--fail[a-z-]*)(?=\s|$)/.test(appel)) defauts.push("curl -f : échec sans message");
    else if (!appel.includes("http_code")) defauts.push("curl sans code HTTP : un refus passe pour un succès");
  }
  const erreurs = [...commandes.matchAll(/::error::(.*)/g)].map((m) => m[1]);
  for (const erreur of erreurs) {
    if (!erreur.includes("DEPLOIEMENT_DECLENCHEUR")) defauts.push(`erreur sans le secret : ${erreur}`);
  }
  if (erreurs.length < 2) defauts.push("aucune erreur pour un refus de l'hébergeur");
  return defauts;
}

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

  // Sans environnement GitHub, aucun relecteur obligatoire ne peut s'interposer :
  // chaque push de main mettait en ligne sans qu'un humain ait rien validé
  // (audit du 2026-11-09). Le job lit le secret de déploiement : l'environnement
  // est aussi l'endroit où il a vocation à vivre.
  it("déclare l'environnement production, la barrière humaine avant la mise en ligne", () => {
    // Au niveau du job, avant ses étapes : une étape n'a pas d'environnement.
    const entete = job.slice(0, job.indexOf("\n    steps:"));
    expect(entete).toMatch(/^ {4}environment: production$/m);
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

  // À l'essai réel sur Render, le 2026-11-05, un deploy hook faux n'a laissé
  // dans le journal que « curl: (22) The requested URL returned error: 404 » :
  // rien ne disait que le secret était en cause.
  it("nomme le secret DEPLOIEMENT_DECLENCHEUR quand l'hébergeur refuse ou ne répond pas, pas seulement quand il manque", () => {
    expect(echecsAnonymes(etapes(job).get(ADAPTATEUR) ?? "")).toEqual([]);
  });

  it("le verrou attrape l'étape de l'essai réel, muette sur un hook refusé", () => {
    const etapeDeLEssai = [
      `      - name: ${ADAPTATEUR}`,
      "        run: |",
      '          if [ -z "$DECLENCHEUR" ]; then',
      `            echo "::error::Secret DEPLOIEMENT_DECLENCHEUR absent : rien n'a été déclenché."`,
      "            exit 1",
      "          fi",
      '          curl -fsS -X POST --url-query "ref=$COMMIT" "$DECLENCHEUR"',
    ].join("\n");
    expect(echecsAnonymes(etapeDeLEssai)).toEqual([
      "curl -f : échec sans message",
      "aucune erreur pour un refus de l'hébergeur",
    ]);
    // Sans -f mais sans lire le code : le 404 de l'essai serait passé pour un succès.
    const sansCode = etapeDeLEssai.replace(
      '          curl -fsS -X POST --url-query "ref=$COMMIT" "$DECLENCHEUR"',
      [
        '          if ! curl -sS -X POST --url-query "ref=$COMMIT" "$DECLENCHEUR"; then',
        '            echo "::error::Secret DEPLOIEMENT_DECLENCHEUR : sans réponse."',
        "            exit 1",
        "          fi",
      ].join("\n")
    );
    expect(echecsAnonymes(sansCode)).toEqual(["curl sans code HTTP : un refus passe pour un succès"]);
    expect(echecsAnonymes(etapeDeLEssai.replace("curl -fsS -X POST", "curl -sS -X POST -f"))).toContain(
      "curl -f : échec sans message"
    );
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

  // À l'essai réel du 2026-11-05, la base est née à 15 Go, le défaut de
  // Render sans diskSizeGB : 4,50 $ par mois de disque vide, et un disque ne
  // se réduit jamais. Sans agrandissement automatique, une base pleine est
  // suspendue par Render.
  it("crée la base sur 1 Go, qui grandit seul quand il se remplit : sans diskSizeGB, Render la crée à 15 Go, sans retour", () => {
    const databases = RENDER.split(/^databases:$/m)[1];
    if (databases === undefined) return;
    expect(databases).toMatch(/^    diskSizeGB: 1$/m);
    expect(databases).toMatch(/^    storageAutoscalingEnabled: true$/m);
    // Avant ipAllowList, fin du bloc que l'assembleur retire sans la brique
    // données : placées après, elles resteraient orphelines.
    const fin = databases.indexOf("    ipAllowList: []");
    expect(databases.indexOf("    diskSizeGB:")).toBeLessThan(fin);
    expect(databases.indexOf("    storageAutoscalingEnabled:")).toBeLessThan(fin);
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
