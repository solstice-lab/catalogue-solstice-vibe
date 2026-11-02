/*
 * Socle commun des scripts de données (imports, correctifs, rattrapages).
 * Repris des scripts d'un projet précédent, où ce protocole a sécurisé tous
 * les correctifs de production.
 *
 * Les règles que ce module encode :
 * - DRY-RUN PAR DÉFAUT : un script lancé sans option n'écrit RIEN. L'écriture
 *   s'obtient avec --confirmer, après relecture du rapport du dry-run.
 * - La base se choisit EXPLICITEMENT à l'invocation (--env-file=…), jamais
 *   implicitement : c'est ce qui évite d'écrire en prod en croyant être en
 *   local. modeEcriture() la nomme en première ligne du rapport.
 * - Un agent ne lance JAMAIS un script d'écriture contre la prod : le
 *   dry-run se relit, le --confirmer se tape à la main, par un humain.
 * - Import additif : une valeur PLEINE en base ne se dégrade jamais ; une
 *   valeur écartée par conflit se LISTE (rapport) plutôt que de se perdre.
 */

export function argumentTexte(nom: string): string | null {
  const argument = process.argv.find((a) => a.startsWith(`--${nom}=`));
  return argument ? argument.slice(nom.length + 3) : null;
}

export function drapeauPresent(nom: string): boolean {
  return process.argv.includes(`--${nom}`);
}

// Hôte, port et nom de la base, jamais l'utilisateur, le mot de passe ni le
// reste de la chaîne de requête (qui peut en porter un) : le rapport se colle
// dans un ticket. Une URL illisible n'est jamais recopiée, pour la même raison.
export function libelleBase(url: string | undefined): string {
  if (!url) return "DATABASE_URL absent";
  try {
    const analysee = new URL(url);
    if (analysee.protocol !== "postgres:" && analysee.protocol !== "postgresql:") return "DATABASE_URL illisible";
    // pg (pg-connection-string) prend ?host= et ?port= avant l'hôte et le port
    // de l'URL : nommer ceux de l'URL désignerait une autre base que la vraie.
    const hote = analysee.searchParams.get("host") || analysee.hostname || "(hôte non précisé)";
    const port = analysee.searchParams.get("port") || analysee.port;
    const nom = decodeURIComponent(analysee.pathname.slice(1));
    // Un mot de passe non encodé qui contient « / » se lit comme un port suivi
    // d'un chemin : « admin:2024/S3cret@hote/base » donnerait « S3cret@hote/base ».
    if (nom.includes("@")) return "DATABASE_URL illisible";
    return `${hote}${port ? `:${port}` : ""}/${nom}`;
  } catch {
    // new URL ou decodeURIComponent (un « % » mal formé dans le nom de base).
    return "DATABASE_URL illisible";
  }
}

/**
 * true si --confirmer est présent. Annonce d'abord la base visée et le mode.
 *
 * La base vient en PREMIÈRE ligne : un --confirmer lancé depuis
 * le mauvais dossier a lu un autre .env.local, la base de l'appli est restée
 * vide et rien ne l'a signalé. C'est la ligne que l'humain relit avant de
 * taper --confirmer, et qui confirme ensuite où il a écrit.
 */
export function modeEcriture(): boolean {
  const ecrire = drapeauPresent("confirmer");
  const base = `Base : ${libelleBase(process.env.DATABASE_URL)}`;
  if (ecrire) {
    console.log(`${base} — ÉCRITURE (--confirmer).\n`);
  } else {
    console.log(`${base} — DRY-RUN, rien ne sera écrit. Relire le rapport, puis relancer avec --confirmer.\n`);
  }
  return ecrire;
}

// La règle de fusion et le parseur CSV vivent dans src/lib/import-fusion.ts
// (la brique import-lot les utilise aussi) ; ré-exportés pour les scripts.
export { parserCsv, valeurRetenue } from "../../src/lib/import-fusion";

export type Rapport = {
  crees: string[];
  completes: string[];
  inchanges: number;
  ecartes: { cle: string; champ: string; valeur: string }[];
  illisibles: { ligne: number; raison: string }[];
};

export function nouveauRapport(): Rapport {
  return { crees: [], completes: [], inchanges: 0, ecartes: [], illisibles: [] };
}

// Les lignes de la section des écarts, avec la ligne blanche qui les précède :
// partagées avec les scripts qui bâtissent leur propre résumé (un script de
// démo), pour qu'un changement de format ne les fasse pas diverger.
export function lignesEcartees(ecartes: Rapport["ecartes"]): string[] {
  if (ecartes.length === 0) return [];
  return [
    "",
    "Valeurs ÉCARTÉES (déjà une valeur en base — à arbitrer à la main) :",
    ...ecartes.map((e) => `  - ${e.cle} · ${e.champ} : « ${e.valeur} »`),
  ];
}

// Le rapport se lit en entier AVANT le --confirmer : c'est lui, la relecture.
export function afficherRapport(rapport: Rapport, ecriture: boolean): void {
  const verbe = ecriture ? "" : " (dry-run, rien n'a été écrit)";
  console.log(`\n=== Rapport${verbe} ===`);
  console.log(`Créés      : ${rapport.crees.length}${rapport.crees.length ? " — " + rapport.crees.join(", ") : ""}`);
  console.log(
    `Complétés  : ${rapport.completes.length}${rapport.completes.length ? " — " + rapport.completes.join(", ") : ""}`
  );
  console.log(`Inchangés  : ${rapport.inchanges}`);
  for (const ligne of lignesEcartees(rapport.ecartes)) console.log(ligne);
  if (rapport.illisibles.length > 0) {
    console.log(`\nLignes ILLISIBLES (non importées) :`);
    for (const i of rapport.illisibles) {
      console.log(`  - ligne ${i.ligne} : ${i.raison}`);
    }
  }
}
