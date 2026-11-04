import { METHODES } from "@/config/comptes";

/*
 * Les traitements de la brique comptes, pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : des faits que le code établit, jamais
 * une base légale, que le projet choisit. La durée de conservation de chaque
 * donnée (`conservation`) est une valeur par défaut que la purge de la brique
 * rgpd applique, à valider avec le client, qui la surcharge par sa clé
 * (CONFIDENTIALITE.durees).
 *
 * Forme : `Traitement` de src/lib/confidentialite.ts, vérifiée là où le socle
 * les assemble. La brique n'importe pas le socle qui l'importe.
 *
 * Les durées sont écrites en toutes lettres : session.ts et code-email.ts
 * lisent la base, que la page publique ne doit pas importer. Un test
 * (tests/comptes-session.test.ts) les compare à DUREE_SESSION_JOURS et
 * DUREE_VALIDITE_MINUTES, et la vie du cookie de parcours de Google et de
 * Microsoft à DUREE_PARCOURS_MINUTES ; l'heure de conservation des empreintes est
 * CONSERVATION_S de code-email.ts.
 */

const COMPTES = {
  cle: "comptes",
  titre: "Comptes et connexion",
  finalite: "Permettre aux personnes autorisées de se connecter, et réserver chaque écran à qui y a droit.",
  donnees: [
    "Adresse e-mail, rôle, compte actif ou désactivé.",
    "Date de création du compte et date de la dernière connexion.",
    "Sessions ouvertes : date d'ouverture et d'expiration. Le cookie porte un jeton aléatoire, dont la base ne garde qu'une empreinte.",
    // Cette ligne et la dernière précision viennent de l'écran /comptes
    // (brique gestion-comptes) : l'assembleur les retire avec lui.
    "Si un administrateur a créé le compte ou choisi son rôle depuis l'appli : l'indication que ce rôle est fixé dans l'appli.",
  ],
  personnes: "Les personnes qui ont un compte.",
  sousTraitants: [],
  precisions: [
    "Un cookie de session, nécessaire à la connexion, est déposé pour 30 jours. Il ne sert à rien d'autre.",
    "Un administrateur peut créer un compte pour une adresse avant toute connexion, et prévenir la personne par un e-mail d'information (voir « Envoi des e-mails »).",
  ],
  conservation: [
    {
      // 24 mois sans connexion : le délai au-delà duquel un compte inutilisé
      // n'a plus de raison d'être gardé, l'usage courant pour un outil
      // professionnel. Un compte jamais connecté n'a pas de dernière
      // connexion : le script ne le compte pas.
      cle: "comptes-inactifs",
      donnee: "Compte (adresse e-mail, rôle, dates)",
      duree: { mois: 24 },
      depart: "après la dernière connexion, puis effacé",
      purge: {
        table: "utilisateurs",
        colonne: "derniere_connexion",
        aLaMain:
          "Un compte ne se supprime pas : il s'anonymise par l'effacement des données de la personne (« Données personnelles »), qui joue ce que les autres unités en font. L'admin vérifie chaque compte listé (une personne en congé, un compte de service) avant de l'effacer.",
      },
    },
    {
      // Une session expirée ne sert plus à rien ; elle n'est effacée qu'à la
      // connexion suivante du même compte, qui peut ne jamais venir. Un jour
      // de marge après l'expiration (30 jours après l'ouverture).
      cle: "sessions",
      donnee: "Sessions ouvertes",
      duree: { jours: 1 },
      depart: "après leur expiration",
      purge: { table: "sessions", colonne: "expire_le" },
    },
  ],
};

const CONNEXION_CODE = {
  cle: "connexion-code",
  titre: "Connexion par code envoyé par e-mail",
  finalite: "Vérifier l'adresse e-mail de qui se connecte, et limiter les demandes de code abusives.",
  donnees: [
    "Pour chaque demande de code : empreintes de l'adresse e-mail saisie, du code et de l'adresse IP, nombre d'essais, date de la demande.",
    "Pour chaque code saisi par erreur : empreinte de l'adresse IP et date.",
  ],
  personnes: "Les personnes qui demandent un code de connexion, qu'elles aient un compte ou non.",
  sousTraitants: [],
  precisions: [
    "Le code part par e-mail (voir « Envoi des e-mails ») et vaut 10 minutes.",
    "Ce sont des empreintes à clé : l'adresse, le code et l'adresse IP n'y figurent pas en clair. Elles ne servent qu'une heure. Passé ce délai, elles sont effacées lors d'une prochaine demande ou saisie de code sur le site, et restent en base jusque-là.",
  ],
  // Une heure : CONSERVATION_S de code-email.ts, la fenêtre des limites de
  // demandes. Le code les efface déjà à la demande suivante ; la purge
  // rattrape celles qu'aucune demande ne suit.
  conservation: [
    {
      cle: "codes-connexion",
      donnee: "Demandes de code (empreintes)",
      duree: { heures: 1 },
      depart: "après la demande",
      purge: { table: "codes_connexion", colonne: "cree_le" },
    },
    {
      cle: "codes-connexion-essais",
      donnee: "Codes saisis par erreur (empreinte de l'adresse IP)",
      duree: { heures: 1 },
      depart: "après la saisie",
      purge: { table: "codes_connexion_essais", colonne: "cree_le" },
    },
  ],
};

// Google n'est pas un sous-traitant de l'appli : la personne s'identifie chez
// lui avec son propre compte, et il traite cette connexion pour son compte et
// selon ses règles. Il est destinataire de la demande, ce que les précisions
// disent. Il ne figure donc pas dans sousTraitants, qui demanderait un lieu
// que l'appli ne choisit pas.
const CONNEXION_GOOGLE = {
  cle: "connexion-google",
  titre: "Connexion avec Google",
  finalite: "Vérifier, par Google, l'identité de qui se connecte avec son compte Google.",
  donnees: [
    "Reçues de Google à chaque connexion : l'adresse e-mail du compte, l'indication que Google l'a vérifiée et, pour un compte Google Workspace, le domaine de l'organisation.",
  ],
  personnes: "Les personnes qui se connectent avec un compte Google, qu'elles aient un compte dans l'appli ou non.",
  sousTraitants: [],
  precisions: [
    "Google reçoit la demande de connexion : il sait que la personne se connecte à l'appli, et traite cette information selon ses propres règles de confidentialité.",
    "L'appli ne garde que l'adresse e-mail, dans le compte (voir « Comptes et connexion »). Le domaine sert à vérifier l'accès et n'est pas conservé.",
    "Un cookie, nécessaire à la connexion, est déposé pour 10 minutes le temps de l'aller-retour chez Google, puis effacé au retour.",
  ],
  // Rien de propre à ce traitement n'est gardé : l'adresse l'est dans le
  // compte, avec sa durée. Le projet écrit la sienne dans ses choix.
  conservation: [],
};

// Microsoft, comme Google, est destinataire de la demande et non
// sous-traitant : la personne s'identifie chez lui avec son compte,
// professionnel ou personnel. Avec un compte professionnel, l'organisation de
// la personne a aussi la trace de la connexion dans son propre annuaire.
const CONNEXION_MICROSOFT = {
  cle: "connexion-microsoft",
  titre: "Connexion avec Microsoft",
  finalite: "Vérifier, par Microsoft, l'identité de qui se connecte avec son compte Microsoft.",
  donnees: [
    "Reçues de Microsoft à chaque connexion : l'adresse e-mail du compte, l'indication que Microsoft en a vérifié le domaine, et l'identifiant de l'annuaire du compte (celui de l'organisation, ou celui des comptes personnels).",
  ],
  personnes: "Les personnes qui se connectent avec un compte Microsoft, qu'elles aient un compte dans l'appli ou non.",
  sousTraitants: [],
  precisions: [
    "Microsoft reçoit la demande de connexion : il sait que la personne se connecte à l'appli, et traite cette information selon ses propres règles de confidentialité. Pour un compte professionnel, l'organisation qui le gère en a aussi la trace.",
    "L'appli ne garde que l'adresse e-mail, dans le compte (voir « Comptes et connexion »). L'identifiant de l'annuaire sert à vérifier l'accès et n'est pas conservé.",
    "Un cookie, nécessaire à la connexion, est déposé pour 10 minutes le temps de l'aller-retour chez Microsoft, puis effacé au retour.",
  ],
  // Comme pour Google : rien de propre n'est gardé, le projet écrit la durée
  // dans ses choix.
  conservation: [],
};

/** Les traitements selon les méthodes proposées : une méthode retirée de la configuration n'est plus décrite. */
export function traitementsComptes(methodes: readonly string[] = METHODES) {
  return [
    COMPTES,
    ...(methodes.includes("code-email") ? [CONNEXION_CODE] : []),
    ...(methodes.includes("google") ? [CONNEXION_GOOGLE] : []),
    ...(methodes.includes("microsoft") ? [CONNEXION_MICROSOFT] : []),
  ];
}

export const TRAITEMENTS_COMPTES = traitementsComptes();
