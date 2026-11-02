import { NextResponse, type NextRequest } from "next/server";
import * as oauth from "oauth4webapi";
import { DOMAINES_GOOGLE_WORKSPACE, METHODES } from "@/config/comptes";
import { admettre, contexteDeLAppli, normaliser } from "./entree";
import { ouvrirParcours, reprendreParcours } from "./parcours";
import { cheminDeRetour } from "./retour";
import { ouvrirSession } from "./session";

/*
 * La connexion avec Google, par OpenID Connect : code
 * d'autorisation avec PKCE, state et nonce, vérifiés au retour par
 * oauth4webapi (sans dépendance, certifiée OpenID : c'est la partie qu'une
 * version écrite à la main se trompe le plus souvent). Google vérifie
 * l'identité ; admettre() décide toujours qui entre, comme pour le code.
 *
 * Deux routes, ouvertes comme sous-chemins de /connexion : le départ
 * (src/app/connexion/google/route.ts) et le retour (…/google/retour). Le
 * départ se fait par un lien, pas par un formulaire : la CSP du socle porte
 * form-action 'self', que Chrome applique aussi à la redirection qui suit
 * l'envoi d'un formulaire.
 */

// Les adresses de Google, écrites ici plutôt que lues à chaque connexion dans
// son document de découverte : elles ne changent pas, et la connexion ne
// dépend pas d'un appel de plus. L'émetteur est celui de ce document. Google
// documente aussi la forme « accounts.google.com », sans https:// : si un vrai
// jeton était refusé sur son émetteur, le journal le dirait
// (OAUTH_JWT_CLAIM_COMPARISON_FAILED), et ce serait à revoir ici.
const GOOGLE: oauth.AuthorizationServer = {
  issuer: "https://accounts.google.com",
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
};

export const CHEMIN_RETOUR_GOOGLE = "/connexion/google/retour";

export type EtatGoogle =
  { configure: true; idClient: string; secretClient: string } | { configure: false; manquantes: string[] };

// Relu à chaque appel : l'environnement fait foi à la requête. Les variables
// manquantes sont nommées, jamais leurs valeurs.
export function etatDeGoogle(): EtatGoogle {
  const idClient = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const secretClient = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const manquantes = [...(idClient ? [] : ["GOOGLE_CLIENT_ID"]), ...(secretClient ? [] : ["GOOGLE_CLIENT_SECRET"])];
  return manquantes.length === 0 ? { configure: true, idClient, secretClient } : { configure: false, manquantes };
}

// Ce que /connexion affiche au retour d'un refus : un code de cette liste, un
// message fixe. Rien du paramètre n'est recopié à l'écran.
export const ERREURS_GOOGLE = {
  "google-annule": "Connexion avec Google annulée.",
  "google-expire": "La connexion avec Google n'a pas abouti. Recommencer.",
  "google-acces": "Ce compte Google n'a pas accès à l'appli. Contacter l'équipe technique.",
  "google-indisponible": "Google n'a pas répondu. Réessayer, ou utiliser une autre façon de se connecter.",
  "google-configuration": "La connexion avec Google est mal configurée. Contacter l'équipe technique.",
} as const;

type ErreurGoogle = keyof typeof ERREURS_GOOGLE;

// Le message d'un code de refus, ou null pour tout autre texte : le paramètre
// s'écrit à la main dans l'adresse (« constructor » ne doit rien trouver).
export function messageDeRefusGoogle(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(ERREURS_GOOGLE, code) ? ERREURS_GOOGLE[code as ErreurGoogle] : null;
}

// Au-delà, le chemin de retour fait grossir le cookie de parcours vers la
// limite de 4 Ko des navigateurs, qui l'ignorent alors sans rien dire, et la
// connexion échouait en silence : on revient à l'accueil.
const LONGUEUR_MAX_RETOUR = 1000;

// Une route s'appelle sans passer par l'écran : la méthode absente de
// METHODES n'existe pas (refus = 404, comme exiger).
function introuvable(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

// 303 : le navigateur revient en GET, quoi qu'il ait fait avant.
function rediriger(requete: NextRequest, chemin: string): NextResponse {
  return NextResponse.redirect(new URL(chemin, requete.nextUrl.origin), 303);
}

// Sans code, /connexion montre ce que la carte Google dit déjà : ce qui manque.
function versConnexion(requete: NextRequest, erreur?: ErreurGoogle): NextResponse {
  return rediriger(requete, erreur ? `/connexion?erreur=${erreur}` : "/connexion");
}

// Le domaine Workspace, en indice pour l'écran de Google : il ne propose que
// les comptes de ce domaine (« * » : tout Workspace). Ce n'est qu'un indice,
// que n'importe qui retire de l'adresse : la règle se vérifie au retour, sur
// la revendication hd de l'ID token.
function indiceDeDomaine(): string | null {
  if (DOMAINES_GOOGLE_WORKSPACE.length === 0) return null;
  return DOMAINES_GOOGLE_WORKSPACE.length === 1 ? normaliser(DOMAINES_GOOGLE_WORKSPACE[0]) : "*";
}

export async function commencerAvecGoogle(requete: NextRequest): Promise<NextResponse> {
  if (!METHODES.includes("google")) return introuvable();
  const etat = etatDeGoogle();
  if (!etat.configure) return versConnexion(requete);

  const verifier = oauth.generateRandomCodeVerifier();
  const state = oauth.generateRandomState();
  const nonce = oauth.generateRandomNonce();
  // L'origine de la requête : celle que Google doit avoir dans ses adresses
  // de retour autorisées (localhost en local, le domaine en ligne). Next lit
  // le protocole dans X-Forwarded-Proto, que pose l'hébergeur. Un Host forgé
  // ne mène qu'à un refus de Google, qui ne connaît pas cette adresse.
  const adresseDeRetour = new URL(CHEMIN_RETOUR_GOOGLE, requete.nextUrl.origin).href;
  const retour = cheminDeRetour(requete.nextUrl.searchParams.get("retour"));
  await ouvrirParcours("google", {
    verifier,
    state,
    nonce,
    retour: retour.length > LONGUEUR_MAX_RETOUR ? "/" : retour,
    adresseDeRetour,
  });

  const vers = new URL(GOOGLE.authorization_endpoint ?? "");
  vers.searchParams.set("response_type", "code");
  vers.searchParams.set("client_id", etat.idClient);
  vers.searchParams.set("redirect_uri", adresseDeRetour);
  // L'adresse seule : ni profil, ni accès à quoi que ce soit chez Google.
  vers.searchParams.set("scope", "openid email");
  vers.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(verifier));
  vers.searchParams.set("code_challenge_method", "S256");
  vers.searchParams.set("state", state);
  vers.searchParams.set("nonce", nonce);
  // Le choix du compte à chaque fois : sur un poste où plusieurs comptes
  // Google sont ouverts, sinon, Google prend le dernier sans demander.
  vers.searchParams.set("prompt", "select_account");
  const hd = indiceDeDomaine();
  if (hd) vers.searchParams.set("hd", hd);
  return NextResponse.redirect(vers, 303);
}

// Les erreurs du protocole s'écrivent dans la console par leur nature, jamais
// par leur contenu : ni le code d'autorisation, ni le secret, ni le jeton. Le
// nom évite « journaliser », la fonction de la brique journal : le test de
// résidus de l'assembleur (tests/aide-assemblage.ts) le prendrait pour un
// appel à elle dans une appli qui ne l'a pas.
function signalerLeRefus(erreur: unknown): void {
  const nature =
    erreur instanceof oauth.ResponseBodyError
      ? `${erreur.code} ${erreur.error}`
      : erreur instanceof oauth.OperationProcessingError
        ? erreur.code
        : erreur instanceof Error
          ? erreur.name
          : "inconnue";
  console.warn(`[comptes] connexion avec Google refusée : ${nature}`);
}

// Un jeton qui ne correspond pas au départ (nonce, destinataire, émetteur,
// dates) ou un code déjà servi : la connexion est à recommencer. Un ID client
// ou un secret refusé par Google : rien ne sert de réessayer, il faut corriger
// la configuration. Le reste (réseau, réponse illisible ou incomplète, panne
// chez Google) : Google n'a pas répondu.
function natureDuRefus(erreur: unknown): ErreurGoogle {
  if (erreur instanceof oauth.ResponseBodyError) {
    if (erreur.error === "invalid_grant") return "google-expire";
    if (erreur.error === "invalid_client" || erreur.error === "unauthorized_client") return "google-configuration";
    return "google-indisponible";
  }
  if (
    erreur instanceof oauth.OperationProcessingError &&
    (erreur.code === oauth.JWT_CLAIM_COMPARISON || erreur.code === oauth.JWT_TIMESTAMP_CHECK)
  ) {
    return "google-expire";
  }
  return "google-indisponible";
}

// Google fait autorité sur l'adresse d'un compte Gmail, et sur celle d'un
// compte Workspace (hd présent) : il en héberge la boîte. Pour un compte Google
// ouvert avec l'adresse d'une autre entreprise, email_verified dit que
// l'adresse a été vérifiée un jour, pas qu'elle appartient encore à cette
// personne : un ancien salarié garde son compte Google après son départ
// (documentation « Sign in with Google », relue le 2026-10-23). Le code par
// e-mail reste là pour ces adresses.
function googleFaitAutorite(email: string, hd: string | null): boolean {
  return email.endsWith("@gmail.com") || hd !== null;
}

export async function terminerAvecGoogle(requete: NextRequest, contexte = contexteDeLAppli()): Promise<NextResponse> {
  if (!METHODES.includes("google")) return introuvable();
  const etat = etatDeGoogle();
  if (!etat.configure) return versConnexion(requete);
  // Sans le parcours de ce navigateur, rien ne se fait : un lien de retour
  // envoyé par un tiers (son propre code) ne connecte personne.
  const parcours = await reprendreParcours("google");
  if (!parcours) return versConnexion(requete, "google-expire");
  const client: oauth.Client = { client_id: etat.idClient };

  let parametres: URLSearchParams;
  try {
    parametres = oauth.validateAuthResponse(GOOGLE, client, requete.nextUrl.searchParams, parcours.state);
  } catch (erreur) {
    if (erreur instanceof oauth.AuthorizationResponseError && erreur.error === "access_denied")
      return versConnexion(requete, "google-annule");
    signalerLeRefus(erreur);
    return versConnexion(requete, "google-expire");
  }

  let revendications: oauth.IDToken | undefined;
  try {
    const reponse = await oauth.authorizationCodeGrantRequest(
      GOOGLE,
      client,
      oauth.ClientSecretPost(etat.secretClient),
      parametres,
      parcours.adresseDeRetour,
      parcours.verifier
    );
    const resultat = await oauth.processAuthorizationCodeResponse(GOOGLE, client, reponse, {
      expectedNonce: parcours.nonce,
      requireIdToken: true,
    });
    // L'ID token arrive de Google, par TLS, sur son point d'échange : OIDC
    // Core 3.1.3.7 accepte alors TLS à la place de sa signature. Ses
    // revendications sont vérifiées : iss, aud, exp, iat, nonce, et azp quand
    // le jeton vise plusieurs applications.
    revendications = oauth.getValidatedIdTokenClaims(resultat);
  } catch (erreur) {
    signalerLeRefus(erreur);
    return versConnexion(requete, natureDuRefus(erreur));
  }

  const email = typeof revendications?.email === "string" ? normaliser(revendications.email) : "";
  const hd = typeof revendications?.hd === "string" && revendications.hd !== "" ? normaliser(revendications.hd) : null;
  // true, le booléen : une chaîne « true » n'est pas une vérification.
  if (!email || revendications?.email_verified !== true || !googleFaitAutorite(email, hd))
    return versConnexion(requete, "google-acces");
  // Le domaine Workspace se lit dans le jeton, pas dans l'adresse de départ.
  // Il s'ajoute à la liste d'accès : admettre() décide encore.
  const domaines = DOMAINES_GOOGLE_WORKSPACE.map(normaliser);
  if (domaines.length > 0 && (hd === null || !domaines.includes(hd))) return versConnexion(requete, "google-acces");
  const compte = await admettre(email, contexte);
  if (!compte) return versConnexion(requete, "google-acces");
  await ouvrirSession(compte);
  // Refiltré ici aussi : le chemin vient du départ, mais un filtre de plus ne
  // coûte rien.
  return rediriger(requete, cheminDeRetour(parcours.retour));
}
