import type { NextRequest } from "next/server";
import { terminerAvecGoogle } from "@/briques/comptes/google";

/*
 * Le retour de Google : l'adresse à déclarer dans la console Google
 * Cloud (README de la brique comptes). Ouverte sans session, comme tout
 * /connexion : c'est elle qui l'ouvre.
 */

export const dynamic = "force-dynamic";

export async function GET(requete: NextRequest): Promise<Response> {
  return terminerAvecGoogle(requete);
}
