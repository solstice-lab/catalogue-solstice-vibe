import { envoyerMail, ErreurEnvoi, type Bloc } from "@/briques/mails/envoi";
import { query, queryOne } from "@/lib/db/client";
import { aujourdhui as aujourdhuiChezLeClient } from "@/lib/format";

/*
 * La boucle d'envoi, une seule fois, dans la brique : le projet précédent
 * l'avait recopiée dans chaque route, et chaque copie avait ses propres
 * oublis. L'appli fabrique les notifications (qui prévenir, de quoi) ; la
 * brique les envoie par la brique mails, isole chaque échec et garde une
 * ligne par envoi dans notifications_envois.
 */

/** Ce que l'appli fabrique : un destinataire (ou rien), un objet, des blocs de texte, jamais du HTML. */
export type Notification = { a: string | null; objet: string; contenu: Bloc[] };

export type Mode = { mode: "reel" } | { mode: "a-blanc" } | { mode: "essai"; a: string };

export type OptionsEnvoi = Mode & {
  /** Le nom du branchement (« dossiers »), gardé au journal. */
  source: string;
  /** En mois, 12 par défaut : le journal plus ancien s'efface à chaque envoi. */
  conservationMois?: number;
  /** « aaaa-mm-jj », le jour du client ; par défaut, celui d'aujourdhui(). */
  aujourdhui?: string;
};

export type Resultat = "envoye" | "echec" | "sans-destinataire" | "prevu";

/** `a` est le destinataire prévu par l'appli, même en essai. */
export type LigneRapport = { a: string | null; objet: string; resultat: Resultat; erreur: string | null };

export type Rapport = {
  mode: Mode["mode"];
  envoyes: number;
  echecs: number;
  sansDestinataire: number;
  /** Hors mode réel seulement : la réponse au mode réel part dans les journaux de la tâche planifiée. */
  lignes?: LigneRapport[];
};

export class ErreurNotifications extends Error {
  constructor(message: string) {
    super(`Brique notifications : ${message}`);
    this.name = "ErreurNotifications";
  }
}

export const CONSERVATION_MOIS_PAR_DEFAUT = 12;

// Rangées comme la brique rgpd les cherche : en minuscules, sans espaces.
function normaliser(adresse: string): string {
  return adresse.trim().toLowerCase();
}

// Lues à chaque appel, comme les variables de la brique mails : un test ou
// l'hébergeur les change sans redémarrer.
function adressesEssaiPermises(): string[] {
  return (process.env.NOTIFICATIONS_ADRESSES_ESSAI ?? "")
    .split(",")
    .map(normaliser)
    .filter((adresse) => adresse !== "");
}

/**
 * Les réglages d'un branchement, vérifiés aussi par la route dès sa création :
 * une erreur de l'appli doit casser le démarrage, pas passer pour une requête
 * mal formée.
 */
export function verifierReglages(reglages: { source: string; conservationMois?: number }): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(reglages.source)) {
    throw new ErreurNotifications(`la source « ${reglages.source} » doit être un nom simple, en minuscules.`);
  }
  const mois = reglages.conservationMois ?? CONSERVATION_MOIS_PAR_DEFAUT;
  if (!Number.isInteger(mois) || mois < 1) {
    throw new ErreurNotifications("la durée de conservation doit être un nombre entier de mois, au moins 1.");
  }
}

function verifierOptions(options: OptionsEnvoi): void {
  verifierReglages(options);
  // Une adresse libre en essai : quiconque détient le secret de la route
  // écrirait à n'importe qui. Refusée avant le moindre envoi.
  if (options.mode === "essai" && !adressesEssaiPermises().includes(normaliser(options.a))) {
    throw new ErreurNotifications("l'adresse d'essai n'est pas dans NOTIFICATIONS_ADRESSES_ESSAI : rien n'est parti.");
  }
}

// Le message d'une erreur de la brique mails ne contient ni la clé ni le
// contenu (son README) ; toute autre erreur reste hors du journal.
function messageDErreur(erreur: unknown): string {
  return erreur instanceof ErreurEnvoi ? erreur.message : "Erreur inattendue à l'envoi.";
}

/**
 * Réserve le jour pour un envoi réel de ce branchement : vrai si la réservation
 * est prise, faux si le jour l'était déjà. Une tâche relancée à la main, même
 * en même temps que la tâche planifiée, n'envoie donc pas deux fois le
 * récapitulatif à tout le monde. La clé primaire tranche entre deux appels
 * simultanés ; lire le journal ne l'aurait pas fait, sa première ligne ne
 * s'écrivant qu'après le premier envoi. Un jour réservé reste réservé, même si
 * tous les envois échouent : la tâche l'a signalé, le récapitulatif suivant
 * rattrape.
 */
export async function reserverLeJour(source: string, jour: string): Promise<boolean> {
  const ligne = await queryOne(
    `INSERT INTO notifications_lancements (source, jour) VALUES ($1, $2::date)
     ON CONFLICT (source, jour) DO NOTHING
     RETURNING source`,
    [source, jour]
  );
  return ligne !== undefined;
}

export async function envoyerNotifications(
  notifications: readonly Notification[],
  options: OptionsEnvoi
): Promise<Rapport> {
  verifierOptions(options);
  const jour = options.aujourdhui ?? aujourdhuiChezLeClient();
  const ecrit = options.mode !== "a-blanc";

  if (ecrit) {
    // L'horloge de Postgres, pas celle de l'appli : envoye_le en vient aussi.
    const mois = options.conservationMois ?? CONSERVATION_MOIS_PAR_DEFAUT;
    await query(`DELETE FROM notifications_envois WHERE envoye_le < now() - make_interval(months => $1)`, [mois]);
    await query(`DELETE FROM notifications_lancements WHERE lance_le < now() - make_interval(months => $1)`, [mois]);
  }

  const lignes: LigneRapport[] = [];
  for (const notification of notifications) {
    const prevu = notification.a?.trim() ? notification.a.trim() : null;
    let ligne: LigneRapport;
    let destinataire: string | null = null;

    if (prevu === null) {
      ligne = { a: null, objet: notification.objet, resultat: "sans-destinataire", erreur: null };
    } else if (options.mode === "a-blanc") {
      ligne = { a: prevu, objet: notification.objet, resultat: "prevu", erreur: null };
    } else {
      const essai = options.mode === "essai";
      destinataire = essai ? options.a.trim() : prevu;
      const contenu: Bloc[] = essai
        ? [{ paragraphe: `Essai : ce message serait parti à ${prevu}.` }, ...notification.contenu]
        : notification.contenu;
      try {
        await envoyerMail({ a: destinataire, objet: notification.objet, contenu });
        ligne = { a: prevu, objet: notification.objet, resultat: "envoye", erreur: null };
      } catch (erreur) {
        // L'échec d'une personne ne bloque ni les suivantes ni le reste.
        ligne = { a: prevu, objet: notification.objet, resultat: "echec", erreur: messageDErreur(erreur) };
      }
    }

    if (ecrit) {
      await query(
        `INSERT INTO notifications_envois (jour, source, mode, destinataire, objet, resultat, erreur)
         VALUES ($1::date, $2, $3, $4, $5, $6, $7)`,
        [
          jour,
          options.source,
          options.mode,
          destinataire === null ? null : normaliser(destinataire),
          notification.objet,
          ligne.resultat,
          ligne.erreur,
        ]
      );
    }
    lignes.push(ligne);
  }

  const compte = (resultat: Resultat) => lignes.filter((ligne) => ligne.resultat === resultat).length;
  const rapport: Rapport = {
    mode: options.mode,
    envoyes: compte("envoye"),
    echecs: compte("echec"),
    sansDestinataire: compte("sans-destinataire"),
  };
  return options.mode === "reel" ? rapport : { ...rapport, lignes };
}
