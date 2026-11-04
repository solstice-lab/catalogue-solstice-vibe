/*
 * Le traitement de la brique contact, pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : des faits que le code établit, jamais
 * une base légale, que le projet choisit. La durée de conservation de chaque
 * donnée (`conservation`) est une valeur par défaut, à valider avec le client,
 * qui la surcharge par sa clé (CONFIDENTIALITE.durees).
 *
 * Forme : `Traitement` de src/lib/confidentialite.ts, vérifiée là où le socle
 * l'assemble. La brique n'importe pas le socle qui l'importe.
 *
 * L'heure est FENETRE_S de filtres.ts, écrite en toutes lettres : filtres.ts
 * lit la base, que la page publique ne doit pas importer. Un test
 * (tests/contact.test.ts) les compare.
 */

export const TRAITEMENTS_CONTACT = [
  {
    cle: "contact",
    titre: "Formulaire de contact",
    finalite: "Répondre aux messages envoyés par le formulaire de contact, et limiter les envois abusifs.",
    donnees: [
      "Nom, adresse e-mail et message saisis : transmis par e-mail à l'éditeur, pas conservés par le site.",
      "Empreinte de l'adresse IP de l'expéditeur et heure de l'envoi.",
    ],
    personnes: "Les personnes qui écrivent par le formulaire de contact.",
    sousTraitants: [],
    precisions: [
      "Le message part par e-mail (voir « Envoi des e-mails »).",
      "L'empreinte de l'adresse IP est effacée au premier message reçu après une heure.",
    ],
    conservation: [
      {
        // FENETRE_S de filtres.ts, qui les efface déjà au message suivant ; la
        // purge rattrape celles qu'aucun message ne suit.
        cle: "contact-envois",
        donnee: "Empreinte de l'adresse IP et heure de l'envoi",
        duree: { heures: 1 },
        depart: "après l'envoi",
        purge: { table: "contact_envois", colonne: "recu_le" },
      },
      {
        // 3 ans après le dernier échange : la durée que la CNIL retient pour
        // les contacts d'un prospect, la plus proche d'un message envoyé par
        // un formulaire public.
        cle: "contact-messages",
        donnee: "Messages reçus par e-mail",
        duree: { mois: 36 },
        depart: "après le dernier échange",
        purge: {
          horsBase:
            "Le site ne garde pas les messages : ils sont dans la boîte de l'éditeur, qui les efface lui-même au terme.",
        },
      },
    ],
  },
];
