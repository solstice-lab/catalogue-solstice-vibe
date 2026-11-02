import type { NextRequest } from "next/server";
import { commencerAvecGoogle } from "@/briques/comptes/google";

/*
 * Le départ de la connexion avec Google : vers l'écran de Google, avec
 * PKCE, state et nonce. Ouverte sans session, comme tout /connexion
 * (src/briques/comptes/protection.ts) : elle précède toute session.
 */

// Chaque départ tire ses propres valeurs : jamais rendue au build ni en cache.
export const dynamic = "force-dynamic";

export async function GET(requete: NextRequest): Promise<Response> {
  return commencerAvecGoogle(requete);
}
