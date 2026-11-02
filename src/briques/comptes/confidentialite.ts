import { METHODES } from "@/config/comptes";

/*
 * Les traitements de la brique comptes, pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : des faits que le code établit, jamais
 * une base légale ni une durée de conservation, que le projet choisit.
 *
 * Forme : `Traitement` de src/lib/confidentialite.ts, vérifiée là où le socle
 * les assemble. La brique n'importe pas le socle qui l'importe.
 *
 * Les durées sont écrites en toutes lettres : session.ts et code-email.ts
 * lisent la base, que la page publique ne doit pas importer. Un test
 * (tests/comptes-session.test.ts) les compare à DUREE_SESSION_JOURS et
 * DUREE_VALIDITE_MINUTES, et la vie du cookie de parcours de Google à
 * DUREE_PARCOURS_MINUTES ; l'heure de conservation des empreintes est
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
};

/** Les traitements selon les méthodes proposées : une méthode retirée de la configuration n'est plus décrite. */
export function traitementsComptes(methodes: readonly string[] = METHODES) {
  return [
    COMPTES,
    ...(methodes.includes("code-email") ? [CONNEXION_CODE] : []),
    ...(methodes.includes("google") ? [CONNEXION_GOOGLE] : []),
  ];
}

export const TRAITEMENTS_COMPTES = traitementsComptes();
