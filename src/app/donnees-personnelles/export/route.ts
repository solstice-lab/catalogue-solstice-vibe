import { peut, utilisateurCourant } from "@/briques/comptes/roles";
import {
  adresseLisible,
  exporterDonnees,
  normaliserAdresse,
  reponseFichier,
  tracerExportDeLAdmin,
} from "@/briques/rgpd/export";
import { vientDUnAutreSite } from "@/briques/rgpd/origine";
import { transaction } from "@/lib/db/client";

/*
 * Le fichier des données d'une adresse donnée, pour l'admin. POST
 * seulement : l'adresse passe dans le corps du formulaire, jamais dans l'URL,
 * qui finirait dans les journaux de l'hébergeur et l'historique du navigateur.
 *
 * L'export se trace avant que le fichier parte (au journal d'audit, quand
 * l'appli l'a) : une trace qui échoue lève, et rien ne sort.
 */
export async function POST(request: Request): Promise<Response> {
  // Pas de page à qui rendre `notFound()` : un 404 nu, comme les pages, pour
  // qu'un membre n'apprenne pas que l'adresse existe.
  if (!peut(await utilisateurCourant(), "donnees.exporter")) return new Response(null, { status: 404 });
  if (vientDUnAutreSite(request)) return new Response("Envoi refusé : il ne vient pas de ce site.", { status: 403 });

  const champ = (await request.formData()).get("adresse");
  const adresse = normaliserAdresse(typeof champ === "string" ? champ : "");
  if (!adresseLisible(adresse)) return new Response("Adresse e-mail illisible.", { status: 400 });
  const donnees = await exporterDonnees(adresse);
  // La même personne que le garde : utilisateurCourant est mis en cache le
  // temps de la requête. L'admin est l'auteur de la trace.
  const admin = await utilisateurCourant();
  if (!admin) return new Response(null, { status: 404 });
  await tracerExportDeLAdmin(adresse, { transaction, demandeur: admin.email });
  return reponseFichier(donnees);
}
