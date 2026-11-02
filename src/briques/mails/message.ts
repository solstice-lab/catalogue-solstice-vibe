/*
 * Les types de la brique mails et son erreur. Fichier à part pour que les
 * envoyeurs (resend.ts, local.ts) et envoi.ts les partagent sans s'importer
 * l'un l'autre.
 */

// Un bloc du corps. L'appelant n'écrit jamais de HTML : il donne du texte, la
// brique fabrique le HTML échappé et la version texte (cicatrice :
// un nom inséré tel quel dans le HTML d'un mail).
export type Bloc =
  | { paragraphe: string }
  // Un code à recopier (connexion par code), mis en avant.
  | { code: string }
  // Un lien https ou http ; tout autre schéma est refusé (javascript:, data:).
  | { lien: { libelle: string; url: string } };

// Un seul destinataire par mail : un mail transactionnel ne montre jamais une
// adresse à une autre. Une boucle d'envoi (notifications) appelle une fois par
// personne.
export type Mail = {
  a: string;
  objet: string;
  contenu: Bloc[];
  repondreA?: string;
};

// Ce qu'un envoyeur reçoit : le mail vérifié et composé.
export type MailCompose = {
  a: string;
  objet: string;
  html: string;
  texte: string;
  repondreA?: string;
};

// L'interface qu'un fournisseur remplit. Changer de fournisseur, c'est écrire
// un autre envoyeur et le choisir dans envoi.ts : les appelants ne bougent pas.
export type Envoyeur = {
  envoyer(mail: MailCompose): Promise<{ id: string | null }>;
};

// Un message d'erreur de la brique ne contient jamais la clé d'API ni le
// contenu du mail : il finit dans les journaux de l'hébergeur.
export class ErreurEnvoi extends Error {
  constructor(message: string) {
    super(`Brique mails : ${message}`);
    this.name = "ErreurEnvoi";
  }
}
