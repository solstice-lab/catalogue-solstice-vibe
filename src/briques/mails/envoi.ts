import { composerMail } from "./gabarit";
import { envoyeurCapture, envoyeurConsole } from "./local";
import { ErreurEnvoi, type Envoyeur, type Mail } from "./message";
import { creerEnvoyeurResend } from "./resend";

export { ErreurEnvoi, type Bloc, type Mail, type MailCompose } from "./message";
export { mailsCaptures, viderMailsCaptures } from "./local";

/*
 * La seule porte d'envoi des appelants (connexion par code, notifications,
 * formulaire de contact). Elle ne dépend ni de la base ni d'une session : la
 * connexion par code l'appelle avant qu'il y en ait une.
 */

// Une adresse, une seule : ni virgule, ni espace, ni saut de ligne (un saut de
// ligne dans une adresse ou un objet est la porte d'un en-tête injecté).
const ADRESSE = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]+$/;

function verifier(mail: Mail): Mail {
  if (!ADRESSE.test(mail.a))
    throw new ErreurEnvoi("l'adresse du destinataire n'est pas une adresse e-mail unique et valide.");
  if (mail.repondreA !== undefined && !ADRESSE.test(mail.repondreA)) {
    throw new ErreurEnvoi("l'adresse de réponse n'est pas une adresse e-mail unique et valide.");
  }
  const objet = mail.objet.trim();
  if (objet === "") throw new ErreurEnvoi("l'objet est vide.");
  if (/[\r\n]/.test(objet)) throw new ErreurEnvoi("l'objet doit tenir sur une ligne.");
  if (mail.contenu.length === 0) throw new ErreurEnvoi("le mail n'a aucun contenu.");
  for (const bloc of mail.contenu) {
    if ("lien" in bloc && !lienPermis(bloc.lien.url)) {
      throw new ErreurEnvoi("un lien doit être une adresse https ou http complète.");
    }
  }
  return { ...mail, objet };
}

function lienPermis(url: string): boolean {
  try {
    return ["https:", "http:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

// Lu à chaque envoi, pas au chargement : un réglage changé chez l'hébergeur
// vaut au redémarrage sans dépendre de l'ordre des imports.
// Sûr par défaut : sans réglage, rien ne part ; en production sans réglage,
// l'envoi échoue au lieu de passer pour réussi.
function envoyeurConfigure(): Envoyeur {
  // En test, toujours la capture : une clé égarée dans l'environnement de la
  // CI n'envoie rien.
  if (process.env.NODE_ENV === "test") return envoyeurCapture;
  const fournisseur = (process.env.MAILS_FOURNISSEUR ?? "").trim();
  if (fournisseur === "") {
    if (process.env.NODE_ENV === "production") {
      throw new ErreurEnvoi(
        "MAILS_FOURNISSEUR n'est pas renseignée : en production, aucun mail ne part sans elle. La régler à « resend », avec RESEND_API_KEY et MAILS_EXPEDITEUR."
      );
    }
    return envoyeurConsole;
  }
  if (fournisseur === "console") return envoyeurConsole;
  if (fournisseur === "resend") {
    return creerEnvoyeurResend({ cle: process.env.RESEND_API_KEY, expediteur: process.env.MAILS_EXPEDITEUR });
  }
  throw new ErreurEnvoi(`MAILS_FOURNISSEUR vaut « ${fournisseur} » : valeurs acceptées « resend » ou « console ».`);
}

export async function envoyerMail(mail: Mail): Promise<{ id: string | null }> {
  const verifie = verifier(mail);
  const { html, texte } = composerMail(verifie.objet, verifie.contenu);
  return envoyeurConfigure().envoyer({ a: verifie.a, objet: verifie.objet, html, texte, repondreA: verifie.repondreA });
}
