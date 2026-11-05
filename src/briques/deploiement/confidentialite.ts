/*
 * Ce que la brique déploiement établit pour la politique de confidentialité
 * (src/lib/confidentialite.ts) : le lieu où l'hébergeur traite les
 * données, et ce qui se tient devant lui. render.yaml place le service et la
 * base dans la région de Francfort ; tests/deploiement.test.ts vérifie que ce
 * texte le dit toujours.
 *
 * Le nom de l'hébergeur, lui, reste dans les mentions légales
 * (src/lib/mentions-legales.ts) : une seule source pour les deux pages.
 */

export const LIEUX_DEPLOIEMENT = {
  hebergeur: "Union européenne, Allemagne (région de Francfort)",
};

/*
 * Les sous-traitants que l'hébergeur place devant l'appli, ajoutés à
 * l'hébergement du site. Render passe chaque requête par Cloudflare : à
 * l'essai réel du 2026-11-05, chaque réponse portait « server: cloudflare »
 * et un « cf-ray », et Cloudflare refusait lui-même un CF-Connecting-IP
 * envoyé à la main. Cloudflare reçoit donc l'adresse IP de chaque visiteur.
 * C'est un sous-traitant de Render, pas du client, et une société
 * américaine (render.com/docs/ddos-protection le nomme). Son lieu de
 * traitement et les garanties de transfert hors de l'Union se lisent dans
 * les engagements de Render et se valident avec le client : ils se
 * remplissent dans la configuration, sous la clé « cloudflare », jamais
 * d'avance ici.
 */
export const SOUS_TRAITANTS_DEPLOIEMENT = [
  {
    cle: "cloudflare",
    nom: "Cloudflare, Inc.",
    role: "Sous-traitant de l'hébergeur, placé devant le site contre les attaques par saturation : reçoit l'adresse IP et les requêtes de chaque visiteur.",
  },
];
