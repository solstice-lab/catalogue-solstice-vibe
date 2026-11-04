import type { NextRequest } from "next/server";
import { commencerAvecMicrosoft } from "@/briques/comptes/microsoft";

/*
 * Le départ de la connexion avec Microsoft : vers l'écran de Microsoft, avec
 * PKCE, state et nonce. Ouverte sans session, comme tout /connexion
 * (src/briques/comptes/protection.ts) : elle précède toute session.
 */

// Chaque départ tire ses propres valeurs : jamais rendue au build ni en cache.
export const dynamic = "force-dynamic";

export async function GET(requete: NextRequest): Promise<Response> {
  return commencerAvecMicrosoft(requete);
}
