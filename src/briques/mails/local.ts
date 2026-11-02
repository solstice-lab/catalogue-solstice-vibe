import { ErreurEnvoi, type Envoyeur, type MailCompose } from "./message";

/*
 * Les envoyeurs locaux : rien ne part sur le réseau.
 */

// En développement : le mail s'affiche dans la sortie du serveur, code de
// connexion compris. Refusé en production, où cette sortie devient le journal
// de l'hébergeur : le contenu d'un mail n'y est jamais écrit.
export const envoyeurConsole: Envoyeur = {
  async envoyer(mail) {
    if (process.env.NODE_ENV === "production") {
      throw new ErreurEnvoi(
        "l'envoyeur console est refusé en production (il écrirait le mail dans les journaux). Régler MAILS_FOURNISSEUR à « resend »."
      );
    }
    console.info(
      [`[mails] Mail non envoyé (envoyeur console)`, `À : ${mail.a}`, `Objet : ${mail.objet}`, "", mail.texte, ""].join(
        "\n"
      )
    );
    return { id: null };
  },
};

// En test : le mail est gardé en mémoire, pour qu'un test lise ce qui serait
// parti (le code envoyé par la connexion, par exemple).
const captures: MailCompose[] = [];

export const envoyeurCapture: Envoyeur = {
  async envoyer(mail) {
    captures.push({ ...mail });
    return { id: null };
  },
};

export function mailsCaptures(): MailCompose[] {
  return captures.map((mail) => ({ ...mail }));
}

export function viderMailsCaptures(): void {
  captures.length = 0;
}
