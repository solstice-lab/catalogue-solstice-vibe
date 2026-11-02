import { etatDeLaBase } from "@/lib/db/sante";

/*
 * Sonde de santé, OUVERTE SANS SESSION : avec la brique comptes, elle
 * figure dans ses routes ouvertes (ROUTES_OUVERTES). Sur un projet
 * précédent, placée derrière l'authentification, elle recevait une
 * redirection et chaque déploiement échouait.
 *
 * Elle sert l'hébergeur (statut seul) et la CI, qui attend le commit qu'elle
 * vient de déployer. COMMIT_DEPLOYE est neutre : la brique déploiement
 * la pose au démarrage depuis la variable de l'hébergeur (RENDER_GIT_COMMIT
 * sur Render) ; avec la brique données, elle dit aussi l'état de
 * la base. Rien d'autre dans la réponse : ni donnée métier, ni variable
 * d'environnement, ni erreur de Postgres.
 */

// Jamais rendue au build ni gardée en cache : une réponse figée dirait
// l'ancien commit après un déploiement, ou une base vivante après sa chute.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const base = await etatDeLaBase();
  return Response.json(
    { commit: process.env.COMMIT_DEPLOYE || "inconnu", base },
    {
      status: base === "injoignable" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
