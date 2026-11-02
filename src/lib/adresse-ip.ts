import { createHash } from "node:crypto";

/*
 * L'adresse IP du visiteur, pour les limites par adresse (formulaire de
 * contact ; la connexion par code). Derrière
 * l'hébergeur, l'appli ne voit que son proxy : l'adresse arrive dans un
 * en-tête qu'il pose. Lequel dépend de l'hébergeur, d'où la variable
 * IP_EN_TETE_CLIENT, réglée avec lui (render.yaml pour Render, avec la brique
 * déploiement). Un en-tête que le proxy ne pose pas, le visiteur l'écrit
 * lui-même : X-Forwarded-For garde ce qu'il a envoyé, et un en-tête propre à
 * Cloudflare se forge dès que Cloudflare n'est plus devant. On lit donc
 * l'en-tête configuré, et rien d'autre.
 */

// Un avertissement par cause et par processus : le journal le montre, sans
// le répéter à chaque requête.
const avertis = new Set<string>();

function avertirUneFois(message: string): void {
  if (avertis.has(message)) return;
  avertis.add(message);
  console.warn(`[adresse-ip] ${message}`);
}

/*
 * L'adresse, « local » hors production quand il n'y en a pas (serveur de
 * développement, sans proxy), ou null en production quand il n'y en a pas :
 * variable vide, ou en-tête configuré absent de la requête (mal réglé pour
 * cet hébergeur). L'appelant n'applique alors pas sa limite par adresse :
 * mettre tous les visiteurs dans un même compte bloquerait tout le monde dès
 * qu'un seul insiste.
 */
export function adresseDuVisiteur(enTetes: Pick<Headers, "get">): string | null {
  const nom = (process.env.IP_EN_TETE_CLIENT ?? "").trim().toLowerCase();
  // Une liste (X-Forwarded-For configuré) : la dernière entrée est celle du
  // proxy, les précédentes viennent du visiteur.
  const adresse =
    nom === ""
      ? undefined
      : (enTetes.get(nom) ?? "")
          .split(",")
          .map((entree) => entree.trim())
          .filter((entree) => entree !== "")
          .at(-1);
  if (adresse !== undefined) return adresse;
  if (process.env.NODE_ENV !== "production") return "local";
  avertirUneFois(
    nom === ""
      ? "IP_EN_TETE_CLIENT n'est pas renseignée : les limites par adresse IP ne s'appliquent pas. La régler à l'en-tête où le proxy de l'hébergeur pose l'adresse du visiteur (Render : cf-connecting-ip)."
      : `L'en-tête « ${nom} » (IP_EN_TETE_CLIENT) manque à la requête : les limites par adresse IP ne s'appliquent pas. Vérifier l'en-tête que pose le proxy de l'hébergeur.`
  );
  return null;
}

// Ce qu'une table garde à la place de l'adresse : une empreinte, qui suffit à
// compter. C'est une pseudonymisation, pas une anonymisation (une adresse IPv4
// se retrouve par force brute, l'empreinte n'a pas de sel) : à n'écrire que
// dans une table purgée.
export function empreinteDe(adresse: string): string {
  return createHash("sha256").update(adresse).digest("hex");
}
