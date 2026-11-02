// Vérification des vulnérabilités des dépendances, lancée par la CI avant
// `npm ci`. Échoue sur toute vulnérabilité haute ou critique qui
// ne figure pas dans exceptions-audit.json ; affiche les modérées et faibles
// sans échouer.
//
// Pourquoi un script plutôt que `npm audit --audit-level=high` : l'avis braces
// GHSA-vfj7-8cjw-p6xm, accepté faute de correctif publié, tenait
// `npm audit` au rouge en permanence, et une nouvelle haute serait passée
// inaperçue derrière lui. npm ne sait pas ignorer un avis ; ajouter audit-ci ou
// un équivalent ferait entrer une dépendance de plus dans la chaîne surveillée.
//
// Sans dépendance : il tourne avant `npm ci` (l'audit ne lit que le lockfile).
// Test : tests/verifier-audit.test.ts, sur des sorties d'exemple sans réseau.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FICHIER = "exceptions-audit.json";
const CHAMPS = ["avis", "paquet", "gravite", "portee", "raison", "date", "decision", "reexamen"];
const GRAVITES = { info: "info", low: "faible", moderate: "modérée", high: "haute", critical: "critique" };
const BLOQUANTES = ["haute", "critique"];
const PORTEES = ["dev", "production"];

// Une sortie en erreur (registre injoignable, npm qui plante) ne contient
// aucune vulnérabilité : la lire comme « rien trouvé » ferait passer la CI à
// tort. Le message dit de relancer, pour ne pas la confondre avec une faille.
function lireAudit(texte, libelle) {
  let rapport;
  try {
    rapport = JSON.parse(texte);
  } catch {
    rapport = null;
  }
  if (!rapport || rapport.error || typeof rapport.vulnerabilities !== "object" || rapport.vulnerabilities === null) {
    const detail = rapport?.message ?? (String(texte).trim().slice(0, 300) || "sortie vide");
    return {
      erreur:
        `${libelle} n'a pas rendu de rapport. Ce n'est pas une vulnérabilité : registre npm injoignable, relancer la CI ` +
        `(si le détail ne parle pas du registre, npm lui-même a échoué).\n  Détail : ${detail}`,
    };
  }
  return { vulnerabilites: rapport.vulnerabilities };
}

function lireExceptions(texte) {
  const erreurs = [];
  let contenu;
  try {
    contenu = JSON.parse(texte);
  } catch (e) {
    return { erreurs: [`${FICHIER} illisible : ${e.message}`] };
  }
  if (!Array.isArray(contenu?.exceptions)) return { erreurs: [`${FICHIER} : la liste « exceptions » manque.`] };
  contenu.exceptions.forEach((exception, i) => {
    const nom = `${FICHIER}, exception ${i + 1}${exception?.avis ? ` (${exception.avis})` : ""}`;
    const manquants = CHAMPS.filter((champ) => typeof exception?.[champ] !== "string" || !exception[champ].trim());
    if (manquants.length) return erreurs.push(`${nom} : champ(s) manquant(s) ou vide(s) : ${manquants.join(", ")}.`);
    if (!BLOQUANTES.includes(exception.gravite))
      erreurs.push(
        `${nom} : gravite « ${exception.gravite} » — seules haute et critique bloquent, une autre n'a pas d'exception à écrire.`
      );
    if (!PORTEES.includes(exception.portee))
      erreurs.push(`${nom} : portee « ${exception.portee} » — attendu ${PORTEES.join(" ou ")}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.date))
      erreurs.push(`${nom} : date « ${exception.date} » — attendu AAAA-MM-JJ.`);
  });
  return { exceptions: contenu.exceptions, erreurs };
}

// Les avis eux-mêmes : seul le paquet vulnérable porte l'avis (objet dans
// `via`) ; ceux qui en dépendent le relaient (`via` en texte) et npm les
// compte aussi. braces compte ainsi cinq fois pour un seul avis.
function avisDe(vulnerabilites) {
  const avis = new Map();
  for (const vulnerabilite of Object.values(vulnerabilites)) {
    for (const source of vulnerabilite.via ?? []) {
      if (typeof source !== "object" || source === null) continue;
      const id = /GHSA-[\w-]+/.exec(source.url ?? "")?.[0] ?? String(source.source);
      const paquet = source.name ?? vulnerabilite.name;
      avis.set(`${id} ${paquet}`, {
        id,
        paquet,
        gravite: GRAVITES[source.severity] ?? source.severity,
        titre: source.title,
      });
    }
  }
  return avis;
}

// De la dépendance directe au paquet vulnérable, en remontant `effects` (les
// paquets qui le tirent). Plusieurs chemins possibles : on les donne tous,
// jusqu'à trois.
function chaines(vulnerabilites, paquet) {
  const trouvees = [];
  const remonter = (nom, suite) => {
    const parents = (vulnerabilites[nom]?.effects ?? []).filter((p) => !suite.includes(p));
    if (!parents.length) return trouvees.push([nom, ...suite].join(" → "));
    for (const parent of parents) remonter(parent, [nom, ...suite]);
  };
  remonter(paquet, []);
  const affichees = trouvees.slice(0, 3).join(" ; ");
  return trouvees.length > 3 ? `${affichees} ; et ${trouvees.length - 3} autre(s)` : affichees;
}

/**
 * Confronte les deux sorties de `npm audit --json` (complète et --omit=dev)
 * au fichier d'exceptions. Tout en texte brut, tel que lu sur le disque ou
 * rendu par npm.
 * @param {{ auditComplet: string, auditProduction: string, exceptions: string }} entree
 * @returns {{ erreurs: string[], signalements: string[] }}
 */
export function verifierAudit({ auditComplet, auditProduction, exceptions: texteExceptions }) {
  const complet = lireAudit(auditComplet, "npm audit");
  const production = lireAudit(auditProduction, "npm audit --omit=dev");
  const illisibles = [complet.erreur, production.erreur].filter(Boolean);
  if (illisibles.length) return { erreurs: illisibles, signalements: [] };

  const { exceptions, erreurs: malFormees } = lireExceptions(texteExceptions);
  if (malFormees.length) return { erreurs: malFormees, signalements: [] };

  const erreurs = [];
  const signalements = [];
  const avisComplets = avisDe(complet.vulnerabilites);
  const avisProduction = avisDe(production.vulnerabilites);
  const exceptionDe = (avis) => exceptions.find((e) => e.avis === avis.id && e.paquet === avis.paquet);

  for (const avis of avisComplets.values()) {
    const ligne = `${avis.gravite} : ${avis.id} sur ${avis.paquet} (${avis.titre}) — ${chaines(complet.vulnerabilites, avis.paquet)}`;
    const exception = exceptionDe(avis);
    // Une gravité qui change, dans un sens ou dans l'autre, change les termes
    // de la décision : vers critique, elle ne couvre plus ; vers modérée,
    // l'exception devient inutile et ne doit pas rester dans le fichier.
    if (exception && exception.gravite !== avis.gravite)
      erreurs.push(
        `${avis.id} sur ${avis.paquet} est passé de ${exception.gravite} à ${avis.gravite} : décision à réexaminer dans ${FICHIER}.`
      );
    else if (exception)
      signalements.push(`exception appliquée (${exception.portee}) : ${ligne}. Réexamen : ${exception.reexamen}`);
    else if (BLOQUANTES.includes(avis.gravite))
      erreurs.push(`Vulnérabilité ${ligne}. À corriger, ou à inscrire dans ${FICHIER} sur décision.`);
    else signalements.push(ligne);
  }

  for (const exception of exceptions) {
    const avis = { id: exception.avis, paquet: exception.paquet };
    if (!avisComplets.has(`${avis.id} ${avis.paquet}`)) {
      erreurs.push(`${avis.id} sur ${avis.paquet} ne remonte plus : exception sans objet, à retirer de ${FICHIER}.`);
    } else if (exception.portee === "dev" && avisProduction.has(`${avis.id} ${avis.paquet}`)) {
      erreurs.push(
        `${avis.id} sur ${avis.paquet}, accepté pour le développement seulement, arrive dans les dépendances de production : ` +
          `${chaines(production.vulnerabilites, avis.paquet)}. L'exception ne le couvre plus.`
      );
    }
  }

  return { erreurs, signalements };
}

function npmAudit(racine, ...options) {
  // npm sort en 1 dès qu'il trouve une vulnérabilité : le code ne dit rien,
  // seule la sortie JSON compte. Sous Windows, npm est un .cmd, que Node ne
  // lance plus sans shell ; la commande est une chaîne fixe, rien n'y est
  // interpolé (Node déconseille de passer des arguments avec un shell).
  const resultat = spawnSync(["npm", "audit", "--json", ...options].join(" "), {
    cwd: racine,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });
  return resultat.stdout ?? "";
}

function principal() {
  const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let exceptions;
  try {
    exceptions = fs.readFileSync(path.join(racine, FICHIER), "utf-8");
  } catch (e) {
    console.error(`${FICHIER} introuvable à la racine du dépôt (${e.message}).`);
    process.exit(1);
  }
  // Options imposées sur la ligne de commande, qui l'emporte sur .npmrc et
  // l'environnement. --offline=false : hors ligne, npm rend un rapport vide
  // et valide, lu comme « rien trouvé » (constaté avec npm 11.19).
  // --include=dev : NODE_ENV=production retire sinon les dépendances de
  // développement de l'audit complet, et braces avec elles.
  const { erreurs, signalements } = verifierAudit({
    auditComplet: npmAudit(racine, "--include=dev", "--offline=false"),
    auditProduction: npmAudit(racine, "--omit=dev", "--offline=false"),
    exceptions,
  });
  for (const ligne of signalements) console.log(`  ${ligne}`);
  if (erreurs.length) {
    console.error(`\nÉchec de la vérification des vulnérabilités :`);
    for (const ligne of erreurs) console.error(`  - ${ligne}`);
    process.exit(1);
  }
  console.log("\nAucune vulnérabilité haute ou critique hors exceptions.");
}

// Lancé par la CI, et non importé par le test. Le chemin peut contenir espaces
// et accents, d'où la comparaison par URL encodée.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal();
}
