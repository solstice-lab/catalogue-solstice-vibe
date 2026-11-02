import { peut, utilisateurCourant } from "@/briques/comptes/roles";
import { exporterDonnees, reponseFichier } from "@/briques/rgpd/export";

/*
 * Le fichier des données de la personne connectée. L'adresse vient de
 * la session et de nulle part ailleurs : une adresse lue dans la requête
 * ouvrirait les données des autres à tout membre.
 */
export async function GET(): Promise<Response> {
  if (!peut(await utilisateurCourant(), "mes-donnees.exporter")) return new Response(null, { status: 404 });
  // Relue après le garde : une session fermée entre les deux lectures donne
  // le même 404, jamais une erreur.
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) return new Response(null, { status: 404 });
  return reponseFichier(await exporterDonnees(utilisateur.email));
}
