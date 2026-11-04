// Purge des données au terme de leur durée de conservation (brique rgpd) :
// celles que chaque brique déclare dans son confidentialite.ts, avec les
// durées du projet (CONFIDENTIALITE.durees de src/lib/confidentialite.ts), le
// journal d'audit compris, dont la base garde le DELETE pour cette purge.
//
// Le protocole (voir scripts/lib/cli.ts pour les règles complètes) :
//   npx tsx --env-file=.env.local scripts/purger-donnees.ts                (dry-run : ce qui serait effacé)
//   npx tsx --env-file=.env.local scripts/purger-donnees.ts --confirmer    (efface)
//
// Contre la prod : --env-file=.env.prod, lancé À LA MAIN après relecture du
// dry-run — jamais par un agent. La première ligne nomme la base visée.
//
// Le dry-run joue la purge dans une transaction et l'annule : les nombres
// qu'il donne sont ceux que --confirmer effacera, à l'heure près. Rejouée, la
// purge ne trouve plus rien. Ce qu'elle ne peut pas effacer d'office (un
// compte inactif, un message hors du site) est listé, jamais tu.

import { transaction } from "../src/lib/db/client";
import { dureesInconnues } from "../src/lib/confidentialite";
import { apercevoirPurge, purger, type BilanPurge } from "../src/briques/rgpd/purge";
import { modeEcriture } from "./lib/cli";

async function principal() {
  const ecriture = modeEcriture();

  // Une durée surchargée sous une clé que rien ne déclare : la durée de la
  // brique s'appliquerait à sa place, sans que rien le dise.
  const inconnues = dureesInconnues();
  if (inconnues.length > 0) {
    console.error(
      `CONFIDENTIALITE.durees nomme des conservations que rien ne déclare : ${inconnues.join(", ")}. Corriger la clé avant de purger.`
    );
    process.exit(1);
  }

  const bilan = ecriture ? await purger({ transaction }) : await apercevoirPurge({ transaction });
  if ("occupee" in bilan) {
    console.log("Une autre purge est en cours (au passage d'une requête, ou un autre lancement) : relancer plus tard.");
    process.exit(1);
  }
  afficher(bilan);
  process.exit(0);
}

function afficher(bilan: BilanPurge): void {
  const verbe = bilan.effectue ? "Effacées" : "À effacer (dry-run, rien n'a été effacé)";
  console.log(`=== ${verbe} ===`);
  if (bilan.effacees.length === 0) console.log("  (aucune durée déclarée avec une purge)");
  for (const ligne of bilan.effacees) {
    console.log(`  - ${ligne.traitement} · ${ligne.donnee} (${ligne.table}, ${ligne.duree}) : ${ligne.lignes}`);
  }
  if (bilan.aLaMain.length > 0) {
    console.log("\n=== Échues, que rien n'efface d'office : à traiter à la main ===");
    for (const ligne of bilan.aLaMain) {
      console.log(`  - ${ligne.traitement} · ${ligne.donnee} (${ligne.table}, ${ligne.duree}) : ${ligne.lignes}`);
      console.log(`    ${ligne.raison}`);
    }
  }
  if (bilan.horsBase.length > 0) {
    console.log("\n=== Durées déclarées hors de la base : rien à purger ici ===");
    for (const ligne of bilan.horsBase) {
      console.log(`  - ${ligne.traitement} · ${ligne.donnee} (${ligne.duree})`);
      console.log(`    ${ligne.raison}`);
    }
  }
}

principal().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
