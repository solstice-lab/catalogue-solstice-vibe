import { origineDuCodespace } from "@/lib/codespaces";

/*
 * Le contrôle d'origine du formulaire d'export de l'admin. Un Route Handler
 * ne contrôle rien de lui-même, contrairement à une Server Action : la page
 * d'un autre site pourrait poster ce formulaire. Le navigateur n'y joindrait
 * pas le cookie (SameSite=Lax), donc sans droit ; ce contrôle fait une
 * défense de plus.
 *
 * Même règle que l'envoi d'un import de la brique import-lot, recopiée : une
 * brique n'importe pas l'intérieur d'une autre, et l'appli n'a pas toujours
 * celle-là. Pas d'en-tête Origin : un appel hors navigateur,
 * qui n'a pas de session à voler. Seule exception, l'appli de développement
 * dans GitHub Codespaces, dont le proxy change l'origine (src/lib/codespaces.ts).
 */
export function vientDUnAutreSite(request: Request): boolean {
  const origine = request.headers.get("origin");
  if (origine === null) return false;
  const hote = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  if (origineDuCodespace(origine, hote)) return false;
  try {
    return new URL(origine).host !== hote;
  } catch {
    // « null » (page sandboxée, redirection) : une origine illisible n'est pas la nôtre.
    return true;
  }
}
