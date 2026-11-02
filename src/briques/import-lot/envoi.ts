import { verifierEcran, type Branchement } from "./branchement";
import { ErreurFichier, OCTETS_MAX } from "./lecture";
import { creerLot } from "./lot";

/*
 * Le cœur de l'envoi du fichier, que le Route Handler de l'appli
 * (`${chemin}/envoi/route.ts`) appelle APRÈS son garde de droits : la brique
 * ne connaît pas les droits. Un Route Handler et non une Server Action
 * (décision de la personne responsable du projet, 2026-10-19) : une Server
 * Action refuse tout corps de plus de 1 Mo (413, « Body exceeded 1 MB
 * limit », réglable par serverActions.bodySizeLimit), constaté sur Next 16.3.4
 * avec des fichiers de 2, 5 et 9 Mo, alors qu'un Route Handler a lu 12 Mo sans
 * limite propre. Le plafond est donc celui de la brique (10 Mo, 50 000
 * lignes), pas celui du cadriciel. Essai local : un proxy d'hébergeur peut en
 * poser un plus bas.
 */

function message(texte: string, statut: number): Response {
  return Response.json({ message: texte }, { status: statut });
}

// Marge du multipart (frontières, noms de champs) au-dessus des octets du
// fichier : un fichier exactement au plafond ne doit pas être refusé ici.
const MARGE_MULTIPART = 64 * 1024;
const CORPS_MAX = OCTETS_MAX + MARGE_MULTIPART;

const TROP_GROS = `Ce fichier dépasse ${OCTETS_MAX / 1024 / 1024} Mo : le découper en plusieurs fichiers.`;

// Une Server Action contrôle d'office que la requête vient du site lui-même ;
// un Route Handler ne contrôle rien. Sans ce contrôle, la page d'un autre site
// pourrait poster un fichier ici : le navigateur n'y joindrait pas le cookie
// (SameSite=lax), et le garde de l'appli ne serait plus qu'une seule
// défense (sans cookie, personne n'a de droit dans le catalogue).
// Pas d'en-tête Origin : un appel hors navigateur, qui n'a pas de
// session à voler.
function vientDUnAutreSite(request: Request): boolean {
  const origine = request.headers.get("origin");
  if (origine === null) return false;
  const hote = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origine).host !== hote;
  } catch {
    // « null » (page sandboxée, redirection) : une origine illisible n'est pas la nôtre.
    return true;
  }
}

// Le corps est compté en le lisant et abandonné au plafond : sans en-tête
// content-length (transfert par morceaux), `request.formData()` aurait chargé
// un fichier de plusieurs centaines de Mo en mémoire avant que la brique le
// refuse, dans un process partagé par toute l'appli. Rend null au-delà.
async function lireCorps(request: Request): Promise<Uint8Array | null> {
  const lecteur = request.body?.getReader();
  if (!lecteur) return new Uint8Array();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    if (total > CORPS_MAX) {
      await lecteur.cancel();
      return null;
    }
    morceaux.push(value);
  }
  return Buffer.concat(morceaux);
}

export async function actionEnvoyer(branchement: Branchement, request: Request): Promise<Response> {
  verifierEcran(branchement);
  if (vientDUnAutreSite(request)) return message("Envoi refusé : il ne vient pas de cette application.", 403);

  // Refusé sur l'en-tête quand il existe, avant de lire un seul octet.
  if (Number(request.headers.get("content-length")) > CORPS_MAX) return message(TROP_GROS, 413);
  const corps = await lireCorps(request);
  if (corps === null) return message(TROP_GROS, 413);

  let fichier: FormDataEntryValue | null;
  try {
    const donnees = await new Response(corps as BodyInit, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    fichier = donnees.get("fichier");
  } catch {
    return message("Envoi illisible : choisir de nouveau le fichier.", 422);
  }
  if (!(fichier instanceof File)) return message("Aucun fichier reçu : choisir un fichier .xlsx ou CSV.", 422);

  try {
    const lot = await creerLot(branchement, fichier.name, new Uint8Array(await fichier.arrayBuffer()));
    return Response.json({ lotId: lot.id }, { status: 201 });
  } catch (erreur) {
    // Un fichier que la brique ne sait pas lire (.xls, colonne absente…) : son
    // message est fait pour la personne. Le reste est une vraie panne.
    if (erreur instanceof ErreurFichier) return message(erreur.message, 422);
    throw erreur;
  }
}
