import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { secretDeSession } from "./jeton";

/*
 * Le cookie de parcours d'une connexion par un fournisseur (Google,
 * Microsoft) : ce que le départ tire au hasard (PKCE, state, nonce) et
 * que le retour doit retrouver, dans le même navigateur. Aucune table : le
 * parcours dure quelques minutes et n'appartient qu'à ce navigateur.
 *
 * Signé par AUTH_SECRET : le contenu ne se retouche pas (le chemin de retour,
 * l'adresse de retour). La signature n'empêche pas un tiers d'obtenir un
 * cookie valable, en partant lui-même vers Google : ce qui l'empêche de le
 * poser chez quelqu'un d'autre (connexion forcée sous son compte), c'est le
 * préfixe __Host- en production, qu'aucun sous-domaine ne peut écrire. Lu une
 * seule fois, puis effacé : un retour rejoué ne trouve plus rien.
 */

// La forme écrite d'une signature HMAC-SHA256 en base64url. Vérifiée avant la
// comparaison : timingSafeEqual lève une erreur sur deux longueurs d'octets
// différentes, et un caractère accentué décodé du cookie en donnait une.
const FORME_SIGNATURE = /^[A-Za-z0-9_-]{43}$/;

export const DUREE_PARCOURS_MINUTES = 10;

export type Parcours = {
  // Le code_verifier de PKCE, envoyé au fournisseur à l'échange du code.
  verifier: string;
  state: string;
  nonce: string;
  // Déjà filtré par cheminDeRetour au départ, refiltré au retour.
  retour: string;
  // Identique à l'aller et au retour : le fournisseur refuse l'échange sinon.
  adresseDeRetour: string;
};

type Contenu = Parcours & { expire: number };

// Comme le cookie de session : __Host- en production, qui l'oblige à être
// Secure, sur / et sans domaine.
export function nomDuCookieDeParcours(fournisseur: string): string {
  return process.env.NODE_ENV === "production" ? `__Host-parcours-${fournisseur}` : `parcours-${fournisseur}`;
}

// Lax, pas Strict : le retour du fournisseur est une navigation venue d'un
// autre site, et un cookie Strict n'y serait pas envoyé.
function attributs() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
}

// Le fournisseur est dans la signature : un parcours Google ne se rejoue pas
// comme un parcours d'un autre fournisseur.
function signature(fournisseur: string, donnees: string, secret: string): string {
  return createHmac("sha256", secret).update(`${fournisseur}.${donnees}`).digest("base64url");
}

export async function ouvrirParcours(fournisseur: string, parcours: Parcours): Promise<void> {
  const secret = secretDeSession();
  const contenu: Contenu = { ...parcours, expire: Date.now() + DUREE_PARCOURS_MINUTES * 60 * 1000 };
  const donnees = Buffer.from(JSON.stringify(contenu)).toString("base64url");
  (await cookies()).set(nomDuCookieDeParcours(fournisseur), `${donnees}.${signature(fournisseur, donnees, secret)}`, {
    ...attributs(),
    maxAge: DUREE_PARCOURS_MINUTES * 60,
  });
}

// Le parcours de ce navigateur, effacé dès sa lecture, ou null : absent,
// retouché ou expiré. L'expiration est dans la partie signée : le maxAge du
// cookie, lui, n'engage que le navigateur.
export async function reprendreParcours(fournisseur: string): Promise<Parcours | null> {
  const pot = await cookies();
  const nom = nomDuCookieDeParcours(fournisseur);
  const valeur = pot.get(nom)?.value;
  pot.delete({ name: nom, ...attributs() });
  if (!valeur) return null;
  const morceaux = valeur.split(".");
  if (morceaux.length !== 2) return null;
  const [donnees, signee] = morceaux;
  const attendue = signature(fournisseur, donnees, secretDeSession());
  // Comparaison à temps constant, comme pour la session (jeton.ts).
  if (!FORME_SIGNATURE.test(signee) || !timingSafeEqual(Buffer.from(signee), Buffer.from(attendue))) return null;
  let contenu: Contenu;
  try {
    contenu = JSON.parse(Buffer.from(donnees, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (typeof contenu?.expire !== "number" || contenu.expire <= Date.now()) return null;
  const { verifier, state, nonce, retour, adresseDeRetour } = contenu;
  if (![verifier, state, nonce, retour, adresseDeRetour].every((champ) => typeof champ === "string" && champ !== ""))
    return null;
  return { verifier, state, nonce, retour, adresseDeRetour };
}
