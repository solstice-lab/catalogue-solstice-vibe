import { query } from "./client";

// État de la base vu par la sonde /sante. Le seul point où la route
// touche la base : la brique données décide si la route l'appelle.
export type EtatBase = "ok" | "injoignable" | "non-configuree";

// « Pas de base configurée » se lit dans la variable, sans appeler query() :
// creerPool() lèverait, et une appli sans brique données doit répondre 200.
// « Injoignable » couvre tout échec de la requête (port fermé, mot de passe
// refusé, migration en échec) : dans chaque cas, l'appli ne peut pas servir.
// Passer par query() fait jouer schéma et migrations à la première sonde
// après un déploiement, c'est voulu.
export async function etatDeLaBase(): Promise<EtatBase> {
  if (!process.env.DATABASE_URL) return "non-configuree";
  try {
    await query("SELECT 1");
    return "ok";
  } catch (erreur) {
    // La cause va aux journaux du serveur, jamais dans la réponse : un
    // message de Postgres peut nommer l'hôte, la base ou l'utilisateur.
    console.error("Sonde /sante : base injoignable.", erreur);
    return "injoignable";
  }
}
