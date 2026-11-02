import { peut, utilisateurCourant } from "@/briques/comptes/roles";
import { adresseLisible, exporterDonnees, normaliserAdresse, reponseFichier } from "@/briques/rgpd/export";
import { vientDUnAutreSite } from "@/briques/rgpd/origine";

/*
 * Le fichier des données d'une adresse donnée, pour l'admin. POST
 * seulement : l'adresse passe dans le corps du formulaire, jamais dans l'URL,
 * qui finirait dans les journaux de l'hébergeur et l'historique du navigateur.
 */
export async function POST(request: Request): Promise<Response> {
  // Pas de page à qui rendre `notFound()` : un 404 nu, comme les pages, pour
  // qu'un membre n'apprenne pas que l'adresse existe.
  if (!peut(await utilisateurCourant(), "donnees.exporter")) return new Response(null, { status: 404 });
  if (vientDUnAutreSite(request)) return new Response("Envoi refusé : il ne vient pas de ce site.", { status: 403 });

  const champ = (await request.formData()).get("adresse");
  const adresse = normaliserAdresse(typeof champ === "string" ? champ : "");
  if (!adresseLisible(adresse)) return new Response("Adresse e-mail illisible.", { status: 400 });
  return reponseFichier(await exporterDonnees(adresse));
}
