import { NON_EXPORTEES, SOURCES } from "@/config/donnees-personnelles";
import { normaliserAdresse } from "./export";

/*
 * L'effacement des données d'une personne, sur sa demande (RGPD, art. 17),
 * par l'admin. Même découpage que l'export : la brique ne connaît aucune
 * table, chaque source du registre efface ou anonymise ses propres lignes.
 *
 * Tout se joue dans UNE transaction : un refus d'une source (le dernier admin
 * actif) ou un effet en échec annule ce que les autres ont déjà fait.
 * L'aperçu joue le même effacement et l'annule : ce que l'admin lit avant de
 * confirmer est ce que la confirmation fera, refus compris.
 *
 * Ce que l'effacement d'un compte entraîne ailleurs (le journal d'audit, un
 * prénom affiché par un module) ne passe plus par une trace donnée par
 * l'appelant : la source du compte joue les effets du registre des effets de
 * comptes (src/config/effets-comptes.ts), au nom du demandeur.
 *
 * La brique n'importe pas la base : l'appelant lui passe sa fonction de
 * transaction.
 */

/** Ce que l'effacement exécute : la requête de la transaction ouverte par l'appelant. */
export type ExecuteurEffacement = {
  query: (texte: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
};

/** L'admin qui efface, son adresse normalisée : l'auteur de ce qu'une source trace. */
export type AuteurEffacement = { email: string };

/** Ce qu'une source a fait de ses lignes, ou son refus, qui annule tout l'effacement. */
export type EffacementSource = { lignes: number; avertissement?: string } | { erreur: string };

export type BilanEffacement = {
  adresse: string;
  /** Faux pour l'aperçu : rien n'a changé. */
  effectue: boolean;
  sources: { cle: string; titre: string; lignes: number; effacement: string }[];
  /** Ce qui reste à faire hors de l'appli (une adresse encore dans la configuration). */
  avertissements: string[];
  /** Ce qu'aucune adresse ne rattache, à chercher à la main : les données non exportées. */
  nonEffacees: { quoi: string; pourquoi: string }[];
};

export type OptionsEffacement = {
  transaction: <T>(travail: (executeur: ExecuteurEffacement) => Promise<T>) => Promise<T>;
  /** L'adresse de l'admin qui efface : il n'efface pas la sienne, et il est l'auteur de ce qui se trace. */
  demandeur: string;
};

type Refus = { erreur: string };

const SOI_MEME: Refus = {
  erreur: "Vous ne pouvez pas effacer vos propres données : un autre admin le fait, après avoir vérifié la demande.",
};

// Ce qui fait sortir de la transaction pour l'annuler : un refus, ou le bilan
// d'un aperçu.
class Annulation {
  constructor(readonly issue: BilanEffacement | Refus) {}
}

async function jouer(
  adresse: string,
  options: OptionsEffacement,
  effectuer: boolean
): Promise<BilanEffacement | Refus> {
  const normalisee = normaliserAdresse(adresse);
  const auteur: AuteurEffacement = { email: normaliserAdresse(options.demandeur) };
  if (normalisee === auteur.email) return SOI_MEME;
  try {
    return await options.transaction(async (executeur) => {
      const issues = new Map<string, Exclude<EffacementSource, Refus>>();
      // Dans l'ordre INVERSE du registre : le compte, première source, s'anonymise
      // en dernier, après tout ce qui le retrouve par son adresse (ses sessions,
      // le journal).
      for (const source of [...SOURCES].reverse()) {
        const issue = await source.effacer(executeur, normalisee, auteur);
        if ("erreur" in issue) throw new Annulation(issue);
        issues.set(source.cle, issue);
      }
      const bilan: BilanEffacement = {
        adresse: normalisee,
        effectue: effectuer,
        sources: SOURCES.map(({ cle, titre, effacement }) => ({
          cle,
          titre,
          lignes: issues.get(cle)?.lignes ?? 0,
          effacement,
        })),
        avertissements: SOURCES.flatMap(({ cle }) => issues.get(cle)?.avertissement ?? []),
        nonEffacees: NON_EXPORTEES.map(({ quoi, pourquoi }) => ({ quoi, pourquoi })),
      };
      if (!effectuer) throw new Annulation(bilan);
      return bilan;
    });
  } catch (erreur) {
    if (erreur instanceof Annulation) return erreur.issue;
    throw erreur;
  }
}

/** Ce que l'effacement de l'adresse ferait, source par source, sans rien changer ; ou son refus. */
export function apercevoirEffacement(adresse: string, options: OptionsEffacement): Promise<BilanEffacement | Refus> {
  return jouer(adresse, options, false);
}

/** Efface ou anonymise tout ce que l'appli garde sur l'adresse, en une transaction ; ou le refus, et rien ne change. */
export function effacerDonnees(adresse: string, options: OptionsEffacement): Promise<BilanEffacement | Refus> {
  return jouer(adresse, options, true);
}
