/*
 * Crée les bases locales de l'appli, <appli>_dev et <appli>_test, dans le
 * Postgres du docker-compose.yml, si elles manquent, puis affiche la ligne
 * DATABASE_URL à coller dans .env.local et la commande des tests.
 *
 *   docker compose up -d --wait
 *   npx tsx scripts/bases-locales.ts [--conteneur=<nom>]
 *
 * Il n'écrit pas .env.local : les gardes de Claude refusent d'écrire un
 * .env*, c'est la personne qui colle la ligne.
 *
 * Pas de dry-run ni de --confirmer, à la différence des scripts de données
 * (scripts/lib/cli.ts) : il ne joint Postgres que par `docker exec` sur un
 * conteneur local, jamais par une URL, et ne fait que créer des bases vides
 * qui manquent. Il ne passe pas non plus par query(), le client de la base
 * de l'appli : il applique le schéma à la base qu'il vise, et la seule base
 * qui existe avant celles-ci est celle d'administration, « postgres ». Rien
 * à importer de
 * « pg » non plus, ni de psql à installer sur le poste : ceux du conteneur
 * suffisent.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { argumentTexte } from "./lib/cli";
import { ligneEnvLocal, nomsDesBases, urlLocale } from "./lib/bases-locales";

const CONTENEUR_PAR_DEFAUT = "catalogue-postgres";
const PORT_PAR_DEFAUT = 5433;

function docker(args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// Le port publié se lit sur le conteneur plutôt que de supposer le 5433 :
// --conteneur peut viser un Postgres lancé autrement.
function portPublie(conteneur: string): number {
  try {
    const sortie = docker(["port", conteneur, "5432/tcp"]);
    const port = Number(/:(\d+)\s*$/m.exec(sortie)?.[1]);
    return Number.isInteger(port) && port > 0 ? port : PORT_PAR_DEFAUT;
  } catch {
    return PORT_PAR_DEFAUT;
  }
}

function principal(): void {
  const conteneur = argumentTexte("conteneur") ?? CONTENEUR_PAR_DEFAUT;
  const cheminPaquet = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(cheminPaquet)) {
    throw new Error("package.json introuvable : lancer ce script depuis la racine du projet.");
  }
  const paquet = JSON.parse(fs.readFileSync(cheminPaquet, "utf-8")) as { name?: string };
  const bases = nomsDesBases(paquet.name ?? "");

  let existantes: string[];
  try {
    existantes = docker([
      "exec",
      conteneur,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tAc",
      "SELECT datname FROM pg_database",
    ]).split(/\r?\n/);
  } catch (erreur) {
    const detail = (erreur as { stderr?: string }).stderr?.trim() ?? String(erreur);
    console.error(
      `Postgres injoignable dans le conteneur « ${conteneur} » :\n  ${detail}\n\n` +
        "Démarrer Docker, puis `docker compose up -d --wait` depuis ce dossier, et relancer ce script."
    );
    process.exit(1);
  }

  for (const base of [bases.dev, bases.test]) {
    if (existantes.includes(base)) {
      console.log(`${base} : existe déjà, laissée telle quelle.`);
    } else {
      docker(["exec", conteneur, "createdb", "-U", "postgres", base]);
      console.log(`${base} : créée (vide ; le schéma s'applique à la première requête de l'appli).`);
    }
  }

  const port = portPublie(conteneur);
  const urlTest = urlLocale(bases.test, port);
  console.log(
    [
      "",
      "À coller dans .env.local (le script ne l'écrit pas) :",
      "",
      ligneEnvLocal(bases, port),
      "PGSSLMODE=disable",
      "",
      "Tests, PowerShell :",
      "",
      `$env:DATABASE_URL = '${urlTest}'`,
      "$env:PGSSLMODE = 'disable'",
      "npm test",
      "",
      "Tests, bash :",
      "",
      `DATABASE_URL=${urlTest} PGSSLMODE=disable npm test`,
    ].join("\n")
  );
}

// Une erreur attendue (lancé hors de la racine du projet, nom de paquet
// refusé, createdb qui échoue) s'affiche en une phrase, pas en pile Node.
try {
  principal();
} catch (erreur) {
  const e = erreur as { stderr?: string; message?: string };
  console.error(e.stderr?.trim() || e.message || String(erreur));
  process.exit(1);
}
