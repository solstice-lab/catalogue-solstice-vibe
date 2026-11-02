/*
 * Le traitement de la brique mails, pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : des faits que le code établit, jamais
 * une base légale ni une durée de conservation, que le projet choisit.
 *
 * Forme : `Traitement` de src/lib/confidentialite.ts, vérifiée là où le socle
 * l'assemble. La brique n'importe que ses fichiers et le format (son README).
 *
 * Le lieu où Resend traite les e-mails dépend du compte Resend du client
 * (région choisie à sa création) : il se remplit dans la configuration, sous
 * la clé « resend », jamais d'avance ici.
 */

export const TRAITEMENTS_MAILS = [
  {
    cle: "mails",
    titre: "Envoi des e-mails",
    finalite: "Acheminer les e-mails que le site envoie.",
    donnees: ["Adresse du destinataire, objet et contenu de chaque e-mail envoyé."],
    personnes: "Les destinataires des e-mails du site.",
    sousTraitants: [{ cle: "resend", nom: "Resend", role: "Envoi des e-mails." }],
    precisions: [],
  },
];
