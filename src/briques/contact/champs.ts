/*
 * Ce que le formulaire (composant client) et le traitement (serveur) partagent.
 * Ce fichier n'importe rien : le formulaire qui l'importe n'embarque ainsi ni
 * la base ni la brique mails dans le navigateur.
 */

// Les noms des champs postés. Le piège porte un nom qu'un robot a envie de
// remplir : « site_web » ressemble à un vrai champ de formulaire de contact.
export const CHAMPS = {
  nom: "nom",
  adresse: "adresse",
  message: "message",
  piege: "site_web",
  afficheLe: "affiche_le",
} as const;

export const LONGUEUR_MAX = {
  nom: 200,
  // La longueur maximale d'une adresse e-mail (RFC 5321).
  adresse: 254,
  message: 5000,
} as const;

export type ValeursContact = { nom: string; adresse: string; message: string };

// `envoye` : la même réponse que le message soit parti ou filtré comme robot.
// `valeurs` : rendues au formulaire après une erreur, pour que le visiteur ne
// retape pas son message.
export type EtatContact = { envoye?: true; erreur?: string; valeurs?: ValeursContact };
