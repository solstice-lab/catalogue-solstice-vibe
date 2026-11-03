import type { ReglagesEspaces } from "@/briques/espaces/reglages";

/*
 * Les réglages de la brique espaces (README de la brique, « Ce qu'on
 * configure ») : le fichier que le projet remplit, comme src/config/acces.ts
 * pour les droits.
 *
 * Les plafonds valent pour une appli à entrée ouverte : n'importe qui y crée un
 * compte, puis un espace, et ne doit pas pouvoir faire envoyer des mails à
 * n'importe quelle adresse. Valeurs proposées par la fiche de la brique et
 * validées le 2026-11-03.
 */

export const ESPACES: ReglagesEspaces = {
  plusieursParCompte: false,
  vocabulaire: {
    un: "un espace",
    le: "l'espace",
    du: "de l'espace",
    mon: "mon espace",
    ce: "cet espace",
    gestionnaire: "Gestionnaire",
    membre: "Membre",
  },
  plafonds: {
    invitationsParEspaceParJour: 10,
    invitationsParJour: 100,
    codesFauxParHeure: 10,
  },
};
