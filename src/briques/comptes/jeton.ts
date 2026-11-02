import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ErreurComptes } from "./methodes";

/*
 * Le jeton de session et sa signature. Le cookie porte
 * « <jeton>.<HMAC du jeton> » : le proxy écarte un cookie forgé sans lire la
 * base, et la base ne garde que l'empreinte du jeton (une fuite de la base ne
 * donne aucune session). Pièges repris d'un projet précédent : la
 * signature se vérifie avant tout usage du jeton, et un secret vide ou court
 * est refusé, puisqu'un HMAC à clé vide se forge.
 *
 * Aucun accès à la base ici : src/proxy.ts importe ce fichier, et le proxy
 * tourne sur chaque requête, préchargements compris.
 */

const LONGUEUR_MIN_SECRET = 32;
// 32 octets en base64url, sans remplissage : 43 caractères. La signature
// (SHA-256) a la même longueur.
const FORME = /^[A-Za-z0-9_-]{43}$/;

export function secretDeSession(): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < LONGUEUR_MIN_SECRET) {
    throw new ErreurComptes(
      `AUTH_SECRET manque ou fait moins de ${LONGUEUR_MIN_SECRET} caractères. Le générer (voir .env.example) et le déclarer, chez l'hébergeur comme dans .env.local.`
    );
  }
  return secret;
}

// En production, le préfixe __Host- interdit au navigateur d'accepter ce
// cookie s'il n'est pas Secure, posé sur / et sans domaine. En local
// (http://localhost), un cookie Secure ne serait pas renvoyé partout.
export function nomDuCookie(): string {
  return process.env.NODE_ENV === "production" ? "__Host-session" : "session";
}

export function nouveauJeton(): string {
  return randomBytes(32).toString("base64url");
}

function hmac(jeton: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(jeton).digest();
}

export function signer(jeton: string, secret = secretDeSession()): string {
  return `${jeton}.${hmac(jeton, secret).toString("base64url")}`;
}

// Le jeton si la signature est exacte, null sinon. Sans valeur, on n'a pas
// besoin du secret : une requête sans cookie ne dépend pas de la configuration.
// La signature se compare écrite, pas décodée : le dernier de ses 43
// caractères porte deux bits que le décodage ignore, et quatre écritures
// donnaient les mêmes octets.
export function verifierSignature(valeur: string | undefined, secret?: string): string | null {
  if (!valeur) return null;
  const cle = secret ?? secretDeSession();
  const morceaux = valeur.split(".");
  if (morceaux.length !== 2) return null;
  const [jeton, signature] = morceaux;
  if (!FORME.test(jeton) || !FORME.test(signature)) return null;
  // Comparaison à temps constant : une comparaison ordinaire s'arrête au
  // premier octet faux, et sa durée dit combien sont justes.
  return timingSafeEqual(Buffer.from(signature), Buffer.from(hmac(jeton, cle).toString("base64url"))) ? jeton : null;
}

export function empreinte(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}
