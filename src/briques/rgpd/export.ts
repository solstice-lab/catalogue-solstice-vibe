import { NON_EXPORTEES, SOURCES, TABLES_SANS_DONNEE_PERSONNELLE } from "@/config/donnees-personnelles";
import { aujourdhui } from "@/lib/format";
import type { AuteurEffacement, EffacementSource, ExecuteurEffacement, OptionsEffacement } from "./effacement";

/*
 * L'export des données d'une personne : tout ce que l'appli garde sur
 * une adresse, en un fichier JSON lisible (RGPD, art. 15 et 20).
 *
 * La brique ne connaît aucune table : chaque unité décrit ses sources chez
 * elle, et src/config/donnees-personnelles.ts les rassemble. Ce qui ne sort
 * pas (une empreinte, une donnée qu'aucune adresse ne rattache) est dit dans
 * le fichier, avec la raison, plutôt que passé sous silence.
 */

/** Une source de l'export et de l'effacement : des lignes retrouvées par l'adresse. */
export type SourceDonnees = {
  /** Identifiant stable, repris dans le fichier. */
  cle: string;
  titre: string;
  /** Les tables qu'elle couvre (verrou de tests/rgpd-export.test.ts). */
  tables: string[];
  /** Les lignes de l'adresse, reçue en minuscules et sans espaces. Jamais une empreinte. */
  lire: (adresse: string) => Promise<Record<string, unknown>[]>;
  /** Ce que la personne doit savoir sur ces lignes : comment elles sont retrouvées, ce qui n'en sort pas. */
  note?: string;
  /** Ce que l'effacement fait de ces lignes, dit à l'admin avant qu'il confirme. */
  effacement: string;
  // Obligatoire : une source qui ne dirait pas comment s'effacer resterait
  // après l'effacement sans que rien ne le signale. Écrite en méthode, non en
  // propriété : chaque unité la type sur l'exécuteur de sa base, plus riche
  // que ExecuteurEffacement, et TypeScript ne l'accepte ainsi qu'en méthode.
  /**
   * Efface ou anonymise les lignes de l'adresse (minuscules, sans espaces), dans la transaction reçue.
   * `auteur` : l'admin qui efface, que la source du compte passe aux effets d'effacement du registre
   * des effets de comptes (src/config/effets-comptes.ts).
   */
  effacer(executeur: ExecuteurEffacement, adresse: string, auteur: AuteurEffacement): Promise<EffacementSource>;
  /**
   * Facultatif : ce que la source fait quand l'admin exporte l'adresse (minuscules, sans espaces),
   * dans la transaction reçue, au nom de `auteur`, l'admin. La source du journal d'audit y trace
   * l'export ; sans elle, rien ne se trace.
   */
  tracerExport?(executeur: ExecuteurEffacement, adresse: string, auteur: AuteurEffacement): Promise<void>;
};

/** Ce que l'appli garde sans pouvoir le rattacher à une adresse, ou ne garde pas elle-même. */
export type DonneeNonExportee = {
  quoi: string;
  pourquoi: string;
  /** Les tables concernées, s'il y en a (verrou de tests/rgpd-export.test.ts). */
  tables: string[];
};

export type ExportDonnees = {
  adresse: string;
  genere_le: string;
  explication: string;
  sources: { cle: string; titre: string; lignes: Record<string, unknown>[]; note?: string }[];
  non_exportees: { quoi: string; pourquoi: string }[];
};

const EXPLICATION =
  "Les données que ce site garde sur cette adresse, source par source. Les adresses e-mail d'autres personnes qui y figurent sont masquées. « non_exportees » dit ce qu'il garde sans pouvoir le rattacher à une adresse, ou ne garde pas lui-même, et pourquoi.";

const AUTRE_ADRESSE = "(adresse d'une autre personne, masquée)";
const UNE_ADRESSE = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[^\s@"'<>(),;:]+/g;

/*
 * Le droit d'accès ne doit pas livrer les données d'autrui (RGPD art. 15.4).
 * Une ligne sort entière : le contenu d'une demande peut nommer son décideur,
 * une ligne importée d'autres contacts. Toute adresse e-mail autre que celle
 * exportée est donc masquée, où qu'elle soit. Les noms ne le sont pas : rien ne
 * les distingue d'un autre texte (README de la brique).
 */
export function masquerAutresAdresses(valeur: unknown, adresse: string): unknown {
  if (typeof valeur === "string") {
    return valeur.replace(UNE_ADRESSE, (trouvee) => (trouvee.toLowerCase() === adresse ? trouvee : AUTRE_ADRESSE));
  }
  if (Array.isArray(valeur)) return valeur.map((element) => masquerAutresAdresses(element, adresse));
  // Une date sort telle quelle : JSON l'écrit en ISO.
  if (valeur !== null && typeof valeur === "object" && !(valeur instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valeur).map(([cle, element]) => [cle, masquerAutresAdresses(element, adresse)])
    );
  }
  return valeur;
}

/** L'adresse telle qu'elle est rangée : minuscules, sans espaces autour. */
export function normaliserAdresse(adresse: string): string {
  return adresse.trim().toLowerCase();
}

/** Assez pour écarter une saisie qui n'est pas une adresse ; le contrôle fin n'a pas d'objet ici. */
export function adresseLisible(adresse: string): boolean {
  return adresse.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse);
}

export async function exporterDonnees(adresse: string, maintenant: Date = new Date()): Promise<ExportDonnees> {
  const normalisee = normaliserAdresse(adresse);
  const sources = [];
  // L'une après l'autre : quelques requêtes courtes, et le pool reste libre
  // pour le reste de l'appli.
  for (const source of SOURCES) {
    const lignes = (await source.lire(normalisee)).map(
      (ligne) => masquerAutresAdresses(ligne, normalisee) as Record<string, unknown>
    );
    sources.push({ cle: source.cle, titre: source.titre, lignes, ...(source.note ? { note: source.note } : {}) });
  }
  return {
    adresse: normalisee,
    genere_le: maintenant.toISOString(),
    explication: EXPLICATION,
    sources,
    non_exportees: NON_EXPORTEES.map(({ quoi, pourquoi }) => ({ quoi, pourquoi })),
  };
}

/**
 * L'export de l'admin se trace, par les sources qui le font (la brique journal,
 * quand l'appli l'a) : il sort toutes les données d'une personne pour une
 * autre. Celui que la personne fait de ses propres données ne se trace pas.
 * Une seule transaction, avant d'envoyer le fichier : une trace qui échoue
 * lève, et le fichier ne part pas. `demandeur` : l'adresse de l'admin.
 */
export async function tracerExportDeLAdmin(
  adresse: string,
  options: Pick<OptionsEffacement, "transaction" | "demandeur">
): Promise<void> {
  const traceuses = SOURCES.filter((source) => source.tracerExport);
  if (traceuses.length === 0) return;
  const normalisee = normaliserAdresse(adresse);
  const auteur: AuteurEffacement = { email: normaliserAdresse(options.demandeur) };
  await options.transaction(async (executeur) => {
    for (const source of traceuses) await source.tracerExport?.(executeur, normalisee, auteur);
  });
}

/** Le fichier à télécharger : indenté pour se lire dans un éditeur, jamais gardé en cache. */
export function reponseFichier(donnees: ExportDonnees, maintenant: Date = new Date()): Response {
  return new Response(JSON.stringify(donnees, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="donnees-personnelles-${aujourdhui(maintenant)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Les tables de la base que le registre ne déclare pas (oubliées), et les
 * déclarations qui nomment une table absente (fantômes). Les deux listes
 * vides : l'export sait ce que chaque table garde.
 */
export function tablesNonDeclarees(tablesEnBase: string[]): { oubliees: string[]; fantomes: string[] } {
  const declarees = new Set([
    ...SOURCES.flatMap((source) => source.tables),
    ...NON_EXPORTEES.flatMap((donnee) => donnee.tables),
    ...Object.keys(TABLES_SANS_DONNEE_PERSONNELLE),
  ]);
  const enBase = new Set(tablesEnBase);
  return {
    oubliees: [...enBase].filter((table) => !declarees.has(table)).sort(),
    fantomes: [...declarees].filter((table) => !enBase.has(table)).sort(),
  };
}
