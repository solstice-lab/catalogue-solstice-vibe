import { LOCALE } from "@/lib/format";
import type { Bloc } from "./message";

/*
 * Le gabarit : un HTML sobre et sa version texte, depuis les blocs du mail.
 * Ni couleur ni police : les logiciels de messagerie ne lisent pas les
 * variables de src/ui/theme/tokens.css, et une couleur en dur sortirait du
 * thème du client. Le mail s'affiche avec le rendu par défaut du lecteur ;
 * seuls la taille et l'espacement du code sont fixés, pour qu'il se recopie
 * sans confondre ses chiffres.
 */

// Chaque valeur insérée dans le HTML passe par ici, sans exception
// (cicatrice : HTML de mail non échappé). Les guillemets aussi : une
// valeur atterrit dans un attribut href.
export function echapperHtml(valeur: string): string {
  return valeur
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function blocEnHtml(bloc: Bloc): string {
  if ("paragraphe" in bloc) return `<p>${echapperHtml(bloc.paragraphe)}</p>`;
  if ("code" in bloc)
    return `<p style="font-size:1.5em;letter-spacing:0.15em"><strong>${echapperHtml(bloc.code)}</strong></p>`;
  return `<p><a href="${echapperHtml(bloc.lien.url)}">${echapperHtml(bloc.lien.libelle)}</a></p>`;
}

function blocEnTexte(bloc: Bloc): string {
  if ("paragraphe" in bloc) return bloc.paragraphe;
  if ("code" in bloc) return bloc.code;
  return `${bloc.lien.libelle} : ${bloc.lien.url}`;
}

export function composerMail(objet: string, contenu: Bloc[]): { html: string; texte: string } {
  const html = [
    "<!doctype html>",
    `<html lang="${echapperHtml(LOCALE)}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' +
      echapperHtml(objet) +
      "</title></head>",
    "<body>",
    ...contenu.map(blocEnHtml),
    "</body>",
    "</html>",
  ].join("\n");
  return { html, texte: contenu.map(blocEnTexte).join("\n\n") };
}
