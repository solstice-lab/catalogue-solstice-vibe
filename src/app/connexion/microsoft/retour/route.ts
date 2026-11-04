import type { NextRequest } from "next/server";
import { terminerAvecMicrosoft } from "@/briques/comptes/microsoft";

/*
 * Le retour de Microsoft : l'adresse à déclarer dans l'enregistrement de
 * l'application, sur le portail Azure (README de la brique comptes). Ouverte
 * sans session, comme tout /connexion : c'est elle qui l'ouvre.
 */

export const dynamic = "force-dynamic";

export async function GET(requete: NextRequest): Promise<Response> {
  return terminerAvecMicrosoft(requete);
}
