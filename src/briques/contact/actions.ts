"use server";

import { headers } from "next/headers";
import { traiterMessageContact, type EtatContact } from "./contact";

// Ouverte à tout visiteur, sans garde : c'est le formulaire de contact public.
// Les filtres anti-spam de contact.ts en tiennent lieu.
export async function envoyerMessageContact(_etat: EtatContact, donnees: FormData): Promise<EtatContact> {
  return traiterMessageContact(donnees, await headers());
}
