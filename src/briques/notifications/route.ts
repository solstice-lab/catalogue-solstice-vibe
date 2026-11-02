import { createHash, timingSafeEqual } from "node:crypto";
import { aujourdhui } from "@/lib/format";
import {
  envoyerNotifications,
  ErreurNotifications,
  reserverLeJour,
  verifierReglages,
  type Mode,
  type Notification,
} from "./envoi";
import { estJourDEnvoi, type JourSemaine } from "./jour";

/*
 * La route que la tâche planifiée appelle chaque jour : la tâche tourne
 * souvent, la route décide. Elle ne connaît que son secret, le jour du client
 * et la fabrique que l'appli lui donne ; l'appli l'expose en une ligne
 * (export const POST = routeNotifications({ … })).
 */

export type OptionsRoute = {
  /** Le nom du branchement (« dossiers »), gardé au journal. */
  source: string;
  jours: readonly JourSemaine[];
  /** Les notifications à envoyer à cette date (« aaaa-mm-jj », jour du client). */
  fabriquer: (aujourdhui: string) => Notification[] | Promise<Notification[]>;
  conservationMois?: number;
};

function repondre(statut: number, corps: unknown): Response {
  return Response.json(corps, { status: statut });
}

// Les empreintes ont la même longueur : timingSafeEqual lève sur deux
// longueurs différentes, ce qui ferait un 500 au lieu d'un 401, et la durée
// de comparaison ne dit rien du secret.
function secretValide(requete: Request): boolean {
  const attendu = process.env.NOTIFICATIONS_SECRET ?? "";
  const entete = requete.headers.get("authorization") ?? "";
  if (attendu === "" || !entete.startsWith("Bearer ")) return false;
  const empreinte = (texte: string) => createHash("sha256").update(texte).digest();
  return timingSafeEqual(empreinte(entete.slice("Bearer ".length)), empreinte(attendu));
}

// Le mode vient du corps, jamais de l'URL : une adresse en paramètre finirait
// dans les journaux d'accès de l'hébergeur, et une URL « ?mode=a-blanc » lue
// comme un mode réel aurait envoyé pour de vrai. Pour la même raison, seul un
// corps vide vaut le mode réel : un corps qui ne nomme pas son mode
// ({ "Mode": "a-blanc" }, { "a": … }) est une répétition mal tapée, refusée.
async function lireLeMode(requete: Request): Promise<Mode | string> {
  if (new URL(requete.url).search !== "") {
    return "le mode se donne dans le corps de la requête, jamais dans son adresse.";
  }
  const texte = (await requete.text()).trim();
  if (texte === "") return { mode: "reel" };
  let corps: unknown;
  try {
    corps = JSON.parse(texte);
  } catch {
    return "le corps de la requête n'est pas du JSON.";
  }
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    return "le corps de la requête doit être un objet JSON qui nomme son mode.";
  }
  const { mode, a } = corps as { mode?: unknown; a?: unknown };
  if (mode === "reel") return { mode: "reel" };
  if (mode === "a-blanc") return { mode: "a-blanc" };
  if (mode === "essai" && typeof a === "string" && a.trim() !== "") return { mode: "essai", a };
  if (mode === "essai") return "le mode essai demande une adresse (« a »).";
  return "mode inconnu : « reel », « a-blanc » ou « essai ».";
}

export function routeNotifications(options: OptionsRoute): (requete: Request) => Promise<Response> {
  // Au chargement de la route : un branchement mal réglé casse le build ou le
  // démarrage, au lieu de répondre 400 à la tâche planifiée chaque matin.
  verifierReglages(options);
  return async (requete) => {
    if (!secretValide(requete)) return repondre(401, { erreur: "Non autorisé." });

    const mode = await lireLeMode(requete);
    if (typeof mode === "string") return repondre(400, { erreur: `Brique notifications : ${mode}` });

    const jour = aujourdhui();
    // Les répétitions servent à tout moment ; seul l'envoi réel attend son jour.
    if (mode.mode === "reel") {
      if (!estJourDEnvoi(jour, options.jours)) {
        return repondre(200, { envoye: false, aujourdhui: jour, raison: "Pas un jour d'envoi." });
      }
    }

    const notifications = await options.fabriquer(jour);
    // Réservé après la fabrique : une fabrique en échec ne consomme pas le jour.
    if (mode.mode === "reel" && !(await reserverLeJour(options.source, jour))) {
      return repondre(200, { envoye: false, aujourdhui: jour, raison: "Déjà lancé aujourd'hui." });
    }
    try {
      const rapport = await envoyerNotifications(notifications, {
        ...mode,
        source: options.source,
        conservationMois: options.conservationMois,
        aujourdhui: jour,
      });
      return repondre(200, { envoye: mode.mode !== "a-blanc", aujourdhui: jour, ...rapport });
    } catch (erreur) {
      // Les réglages sont vérifiés à la création : ne reste que l'adresse
      // d'essai refusée, une erreur de la requête.
      if (erreur instanceof ErreurNotifications) return repondre(400, { erreur: erreur.message });
      throw erreur;
    }
  };
}
