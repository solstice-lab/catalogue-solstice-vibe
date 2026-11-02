/*
 * Le traitement de la brique contact, pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : des faits que le code établit, jamais
 * une base légale ni une durée de conservation, que le projet choisit.
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
  },
];
