import type { DonneeNonExportee, SourceDonnees } from "@/briques/rgpd/export";
import { SOURCES_COMPTES } from "@/briques/comptes/donnees-personnelles";
import { SOURCES_IMPORT_LOT } from "@/briques/import-lot/donnees-personnelles";
import { SOURCES_JOURNAL } from "@/briques/journal/donnees-personnelles";
import { SOURCES_NOTIFICATIONS } from "@/briques/notifications/donnees-personnelles";
import { SOURCES_VALIDATION } from "@/briques/validation/donnees-personnelles";

/*
 * Ce que l'appli garde sur une personne, unité par unité, pour l'export de ses
 * données (brique rgpd) : le pendant de src/config/acces.ts pour les
 * actions. La brique rgpd ne connaît aucune table ; chaque unité décrit ses
 * sources chez elle, ce fichier les rassemble, une entrée par unité, que
 * l'assembleur retire avec elle.
 *
 * Toute table de la base est déclarée ici, d'une des trois façons :
 * - une SOURCE : ses lignes sortent, retrouvées par l'adresse ;
 * - une donnée NON EXPORTÉE : l'export dit ce qui est gardé et pourquoi rien
 *   ne le rattache à une adresse ;
 * - une table SANS DONNÉE PERSONNELLE, avec la raison.
 * tests/rgpd-export.test.ts refuse une table oubliée : une table neuve (un
 * module, une brique) se déclare avec elle.
 *
 * Chaque source dit aussi comment elle s'efface (effacement, effacer), pour
 * l'effacement des données d'une personne. L'ordre de SOURCES compte :
 * l'effacement le parcourt à l'envers, et SOURCES_COMPTES reste en tête pour
 * que le compte s'anonymise après ce qui le retrouve par son adresse
 * (tests/rgpd-effacement.test.ts le vérifie).
 */

export const SOURCES: SourceDonnees[] = [
  ...SOURCES_COMPTES,
  ...SOURCES_VALIDATION,
  ...SOURCES_IMPORT_LOT,
  ...SOURCES_JOURNAL,
  ...SOURCES_NOTIFICATIONS,
];

// Un objet par entrée : l'assembleur retire celle d'une unité absente.
export const NON_EXPORTEES: DonneeNonExportee[] = [
  {
    quoi: "Saisies de code de connexion erronées",
    pourquoi:
      "Le site n'en garde qu'une empreinte à clé de l'adresse IP et une date, sans le code ni l'adresse e-mail : rien ne les relie à cette adresse. Elles servent une heure, et sont effacées ensuite, lors d'une saisie de code suivante.",
    tables: ["codes_connexion_essais"],
  },
  {
    quoi: "Messages du formulaire de contact",
    pourquoi:
      "Le site ne garde pas les messages : ils partent par e-mail vers l'éditeur, dans sa boîte. Il ne garde qu'une empreinte de l'adresse IP de l'expéditeur, sans adresse e-mail, effacée au premier message reçu après une heure : rien ne la relie à cette adresse.",
    tables: ["contact_envois"],
  },
  {
    quoi: "E-mails envoyés",
    pourquoi:
      "Le site ne garde pas le contenu des e-mails qu'il envoie. Ils passent par le prestataire d'envoi (Resend), qui peut en garder une trace selon ses propres conditions : à demander à l'éditeur.",
    tables: [],
  },
  {
    quoi: "Dossiers",
    pourquoi:
      "Le client d'un dossier est un nom et ses notes un texte libre, sans adresse à retrouver : la recherche par nom se fait à la main.",
    tables: ["dossiers"],
  },
];

// Les tables qui ne gardent rien sur une personne, chacune avec sa raison.
export const TABLES_SANS_DONNEE_PERSONNELLE: Record<string, string> = {
  domaines_admis:
    "Les domaines ouverts à la connexion par un admin (brique comptes), sans adresse e-mail ; les messageries publiques y sont refusées.",
  notifications_lancements: "Les jours où chaque branchement de notifications a envoyé (brique notifications).",
};
