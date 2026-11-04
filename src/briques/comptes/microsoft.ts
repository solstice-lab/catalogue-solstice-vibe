import { NextResponse, type NextRequest } from "next/server";
import * as oauth from "oauth4webapi";
import { ANNUAIRES_MICROSOFT, METHODES } from "@/config/comptes";
import { admettre, contexteDeLAppli, normaliser } from "./entree";
import { ouvrirParcours, reprendreParcours } from "./parcours";
import { cheminDeRetour } from "./retour";
import { ouvrirSession } from "./session";

/*
 * La connexion avec Microsoft (Entra ID), par OpenID Connect, sur la forme de
 * google.ts : code d'autorisation avec PKCE, state et nonce, vérifiés au retour
 * par oauth4webapi. Microsoft vérifie l'identité ; admettre() décide toujours
 * qui entre, comme pour le code.
 *
 * Ce qui diffère de Google : l'annuaire (tenant) d'où vient le compte. Avec
 * « un-seul » (ANNUAIRES_MICROSOFT, le cas normal), seul l'annuaire du client
 * entre ; avec « tous », tout annuaire et les comptes personnels, selon ce que
 * l'enregistrement de l'application accepte dans le portail Azure.
 *
 * Deux routes, sous-chemins de /connexion : le départ
 * (src/app/connexion/microsoft/route.ts) et le retour (…/microsoft/retour). Le
 * départ se fait par un lien, comme pour Google : la CSP du socle porte
 * form-action 'self', que Chrome applique aussi à la redirection qui suit
 * l'envoi d'un formulaire.
 */

const MICROSOFT = "https://login.microsoftonline.com";

// Le point d'entrée de Microsoft commun à tous les annuaires et aux comptes
// personnels. Il n'est l'émetteur d'aucun jeton : chaque jeton porte l'annuaire
// de son compte.
const COMMUN = "common";

// L'ID d'un annuaire, tel que le portail Azure l'affiche. Un nom de domaine
// (client.onmicrosoft.com) mène bien à l'annuaire, mais les jetons portent le
// GUID dans leur émetteur : chacun serait refusé.
const FORME_ANNUAIRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const CHEMIN_RETOUR_MICROSOFT = "/connexion/microsoft/retour";

// Les adresses de Microsoft, écrites ici plutôt que lues dans son document de
// découverte, comme pour Google. Les points d'autorisation et d'échange sont
// ceux de l'annuaire du client, ou le point commun ; l'émetteur attendu est
// toujours celui de l'annuaire du jeton (documentation Microsoft « Validate
// tokens » : le tid du jeton dans le modèle d'émetteur).
function serveurMicrosoft(annuaire: string, annuaireDuJeton: string): oauth.AuthorizationServer {
  return {
    issuer: `${MICROSOFT}/${annuaireDuJeton}/v2.0`,
    authorization_endpoint: `${MICROSOFT}/${annuaire}/oauth2/v2.0/authorize`,
    token_endpoint: `${MICROSOFT}/${annuaire}/oauth2/v2.0/token`,
  };
}

export type EtatMicrosoft =
  | { configure: true; idClient: string; secretClient: string; annuaire: string }
  | { configure: false; manquantes: string[] };

// Relu à chaque appel : l'environnement fait foi à la requête. Les variables
// manquantes sont nommées, jamais leurs valeurs. Toute autre valeur que
// « tous » vaut un seul annuaire : le réglage le plus fermé par défaut.
export function etatDeMicrosoft(): EtatMicrosoft {
  const idClient = (process.env.MICROSOFT_CLIENT_ID ?? "").trim();
  const secretClient = (process.env.MICROSOFT_CLIENT_SECRET ?? "").trim();
  const tous = ANNUAIRES_MICROSOFT === "tous";
  const annuaire = tous ? COMMUN : (process.env.MICROSOFT_TENANT_ID ?? "").trim().toLowerCase();
  const manquantes = [
    ...(idClient ? [] : ["MICROSOFT_CLIENT_ID"]),
    ...(secretClient ? [] : ["MICROSOFT_CLIENT_SECRET"]),
    ...(tous || FORME_ANNUAIRE.test(annuaire) ? [] : ["MICROSOFT_TENANT_ID"]),
  ];
  return manquantes.length === 0
    ? { configure: true, idClient, secretClient, annuaire }
    : { configure: false, manquantes };
}

// Ce que /connexion affiche au retour d'un refus : un code de cette liste, un
// message fixe. Rien du paramètre n'est recopié à l'écran.
export const ERREURS_MICROSOFT = {
  "microsoft-annule": "Connexion avec Microsoft annulée.",
  "microsoft-expire": "La connexion avec Microsoft n'a pas abouti. Recommencer.",
  "microsoft-acces": "Ce compte Microsoft n'a pas accès à l'appli. Contacter l'équipe technique.",
  "microsoft-indisponible": "Microsoft n'a pas répondu. Réessayer, ou utiliser une autre façon de se connecter.",
  "microsoft-configuration": "La connexion avec Microsoft est mal configurée. Contacter l'équipe technique.",
} as const;

type ErreurMicrosoft = keyof typeof ERREURS_MICROSOFT;

// Le message d'un code de refus, ou null pour tout autre texte : le paramètre
// s'écrit à la main dans l'adresse (« constructor » ne doit rien trouver).
export function messageDeRefusMicrosoft(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(ERREURS_MICROSOFT, code)
    ? ERREURS_MICROSOFT[code as ErreurMicrosoft]
    : null;
}

// Comme pour Google : au-delà, le cookie de parcours approche la limite de
// 4 Ko des navigateurs, qui l'ignorent sans rien dire.
const LONGUEUR_MAX_RETOUR = 1000;

// La méthode absente de METHODES n'existe pas (refus = 404, comme exiger).
function introuvable(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

// 303 : le navigateur revient en GET, quoi qu'il ait fait avant.
function rediriger(requete: NextRequest, chemin: string): NextResponse {
  return NextResponse.redirect(new URL(chemin, requete.nextUrl.origin), 303);
}

function versConnexion(requete: NextRequest, erreur?: ErreurMicrosoft): NextResponse {
  return rediriger(requete, erreur ? `/connexion?erreur=${erreur}` : "/connexion");
}

export async function commencerAvecMicrosoft(requete: NextRequest): Promise<NextResponse> {
  if (!METHODES.includes("microsoft")) return introuvable();
  const etat = etatDeMicrosoft();
  if (!etat.configure) return versConnexion(requete);

  const verifier = oauth.generateRandomCodeVerifier();
  const state = oauth.generateRandomState();
  const nonce = oauth.generateRandomNonce();
  // L'origine de la requête, comme pour Google : celle que l'enregistrement
  // de l'application doit avoir dans ses adresses de retour.
  const adresseDeRetour = new URL(CHEMIN_RETOUR_MICROSOFT, requete.nextUrl.origin).href;
  const retour = cheminDeRetour(requete.nextUrl.searchParams.get("retour"));
  await ouvrirParcours("microsoft", {
    verifier,
    state,
    nonce,
    retour: retour.length > LONGUEUR_MAX_RETOUR ? "/" : retour,
    adresseDeRetour,
  });

  const vers = new URL(serveurMicrosoft(etat.annuaire, etat.annuaire).authorization_endpoint ?? "");
  vers.searchParams.set("response_type", "code");
  vers.searchParams.set("client_id", etat.idClient);
  vers.searchParams.set("redirect_uri", adresseDeRetour);
  // L'adresse seule : ni profil, ni accès à quoi que ce soit chez Microsoft.
  vers.searchParams.set("scope", "openid email");
  vers.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(verifier));
  vers.searchParams.set("code_challenge_method", "S256");
  vers.searchParams.set("state", state);
  vers.searchParams.set("nonce", nonce);
  // Le choix du compte à chaque fois, comme pour Google : sur un poste où un
  // compte Microsoft est déjà ouvert, sinon, Microsoft le prend sans demander.
  vers.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(vers, 303);
}

// Les refus s'écrivent dans la console par leur nature, jamais par leur
// contenu : ni le code d'autorisation, ni le secret, ni le jeton, ni
// l'adresse. Même nom que dans google.ts, pour la même raison (le test de
// résidus de l'assembleur prendrait « journaliser » pour la brique journal).
// Une chaîne est une nature écrite dans ce fichier.
function signalerLeRefus(erreur: unknown): void {
  const nature =
    erreur instanceof oauth.ResponseBodyError
      ? `${erreur.code} ${erreur.error}`
      : erreur instanceof oauth.OperationProcessingError
        ? erreur.code
        : erreur instanceof Error
          ? erreur.name
          : typeof erreur === "string"
            ? erreur
            : "inconnue";
  console.warn(`[comptes] connexion avec Microsoft refusée : ${nature}`);
}

// Les mêmes natures que pour Google : à recommencer, configuration à corriger,
// ou Microsoft qui n'a pas répondu.
function natureDuRefus(erreur: unknown): ErreurMicrosoft {
  if (erreur instanceof oauth.ResponseBodyError) {
    if (erreur.error === "invalid_grant") return "microsoft-expire";
    if (erreur.error === "invalid_client" || erreur.error === "unauthorized_client") return "microsoft-configuration";
    return "microsoft-indisponible";
  }
  if (
    erreur instanceof oauth.OperationProcessingError &&
    (erreur.code === oauth.JWT_CLAIM_COMPARISON || erreur.code === oauth.JWT_TIMESTAMP_CHECK)
  ) {
    return "microsoft-expire";
  }
  return "microsoft-indisponible";
}

// L'annuaire que le jeton dit être le sien (tid), lu avant sa vérification
// pour savoir quel émetteur exiger : oauth4webapi compare l'émetteur à une
// valeur fixe, et avec « tous » elle dépend du compte. Lu sur une copie de la
// réponse, que la vérification lit ensuite en entier. null pour une réponse
// sans jeton (une erreur, que la vérification signale) ou un tid mal formé.
async function annuaireDuJeton(reponse: Response): Promise<string | null> {
  try {
    const corps: unknown = await reponse.clone().json();
    const jeton = typeof corps === "object" && corps !== null ? (corps as { id_token?: unknown }).id_token : undefined;
    if (typeof jeton !== "string") return null;
    const charge: unknown = JSON.parse(Buffer.from(jeton.split(".")[1] ?? "", "base64url").toString("utf-8"));
    const tid = typeof charge === "object" && charge !== null ? (charge as { tid?: unknown }).tid : undefined;
    return typeof tid === "string" && FORME_ANNUAIRE.test(tid) ? tid : null;
  } catch {
    return null;
  }
}

export async function terminerAvecMicrosoft(
  requete: NextRequest,
  contexte = contexteDeLAppli()
): Promise<NextResponse> {
  if (!METHODES.includes("microsoft")) return introuvable();
  const etat = etatDeMicrosoft();
  if (!etat.configure) return versConnexion(requete);
  // Sans le parcours de ce navigateur, rien ne se fait : un lien de retour
  // envoyé par un tiers (son propre code) ne connecte personne.
  const parcours = await reprendreParcours("microsoft");
  if (!parcours) return versConnexion(requete, "microsoft-expire");
  const client: oauth.Client = { client_id: etat.idClient };

  let parametres: URLSearchParams;
  try {
    parametres = oauth.validateAuthResponse(
      serveurMicrosoft(etat.annuaire, etat.annuaire),
      client,
      requete.nextUrl.searchParams,
      parcours.state
    );
  } catch (erreur) {
    if (erreur instanceof oauth.AuthorizationResponseError && erreur.error === "access_denied")
      return versConnexion(requete, "microsoft-annule");
    signalerLeRefus(erreur);
    return versConnexion(requete, "microsoft-expire");
  }

  let annuaire: string | null;
  let revendications: oauth.IDToken | undefined;
  try {
    const reponse = await oauth.authorizationCodeGrantRequest(
      serveurMicrosoft(etat.annuaire, etat.annuaire),
      client,
      oauth.ClientSecretPost(etat.secretClient),
      parametres,
      parcours.adresseDeRetour,
      parcours.verifier
    );
    annuaire = await annuaireDuJeton(reponse);
    // Avec un seul annuaire, un compte d'ailleurs n'a pas accès : Microsoft
    // ne devrait pas en émettre ici, et rien ne s'ouvre s'il le fait. Le jeton
    // n'est pas encore vérifié, mais ce n'est qu'un refus.
    if (annuaire !== null && etat.annuaire !== COMMUN && annuaire !== etat.annuaire) {
      signalerLeRefus("compte d'un autre annuaire que MICROSOFT_TENANT_ID");
      return versConnexion(requete, "microsoft-acces");
    }
    const serveur = serveurMicrosoft(etat.annuaire, annuaire ?? etat.annuaire);
    const resultat = await oauth.processAuthorizationCodeResponse(serveur, client, reponse, {
      expectedNonce: parcours.nonce,
      requireIdToken: true,
    });
    // Comme pour Google, l'ID token arrive de Microsoft par TLS, sur son point
    // d'échange : OIDC Core 3.1.3.7 accepte alors TLS à la place de sa
    // signature. Ses revendications sont vérifiées : iss, aud, exp, iat,
    // nonce.
    revendications = oauth.getValidatedIdTokenClaims(resultat);
  } catch (erreur) {
    signalerLeRefus(erreur);
    return versConnexion(requete, natureDuRefus(erreur));
  }

  // L'émetteur vérifié est celui de l'annuaire lu ; le tid vérifié doit être
  // ce même annuaire. Sans tid lisible (annuaire null), rien ne passe : avec
  // « tous », « common » serait sinon accepté comme annuaire.
  if (annuaire === null || revendications?.tid !== annuaire) {
    signalerLeRefus("tid absent ou différent de l'émetteur");
    return versConnexion(requete, "microsoft-expire");
  }

  // xms_edov (revendication facultative, à déclarer dans le portail) : le
  // domaine de l'adresse appartient à l'annuaire du compte, qui l'a vérifié
  // (ou c'est un compte personnel, dont Microsoft vérifie l'adresse). Sans
  // elle, l'administrateur de n'importe quel annuaire écrit l'adresse qu'il
  // veut dans le profil d'un compte, celle d'un client comprise (« nOAuth »,
  // documentation Microsoft « Migrate away from using email claims »). true,
  // le booléen : une chaîne « true » n'est pas une vérification.
  const email = typeof revendications?.email === "string" ? normaliser(revendications.email) : "";
  if (!email || revendications?.xms_edov !== true) {
    signalerLeRefus("adresse absente ou domaine non vérifié par Microsoft (email, xms_edov)");
    return versConnexion(requete, "microsoft-acces");
  }
  const compte = await admettre(email, contexte);
  if (!compte) return versConnexion(requete, "microsoft-acces");
  await ouvrirSession(compte);
  return rediriger(requete, cheminDeRetour(parcours.retour));
}
