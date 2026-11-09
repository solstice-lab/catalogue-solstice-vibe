import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { envoyerMail } from "@/briques/mails/envoi";
import { queryOne } from "@/lib/db/client";
import {
  empreinte,
  empreinteDeLAdresse,
  enregistrerUneDemande,
  sousLaLimiteDeLIp,
  type Planifier,
  type ResultatDemande,
} from "./code-email";
import { admettre, contexteDeLAppli, normaliser, seraitAdmis, type ContexteEntree } from "./entree";
import { secretDeSession } from "./jeton";
import { cheminDeRetour } from "./retour";
import { ouvrirSession } from "./session";

/*
 * La connexion par lien envoyé par e-mail, réservée aux applis grand public
 * (README de la brique : en entreprise, le code reste la méthode).
 *
 * Le piège traité d'abord : les antivirus de messagerie des entreprises ouvrent
 * les liens d'un e-mail avant la personne. Un lien consommé à l'ouverture était
 * servi à la machine, et la personne lisait « lien expiré ». Ouvrir le lien
 * (GET, la page /connexion/lien) ne fait donc que LIRE s'il vaut encore ; seul
 * l'envoi du bouton « Me connecter » (POST, connecterParLien) connecte et le
 * consomme.
 *
 * Le reste est le code par e-mail (code-email.ts), dont les fonctions sont
 * partagées et non recopiées : la demande est une ligne de codes_connexion,
 * sous les mêmes limites par adresse et par IP, comptées avec celles des codes ;
 * même réponse neutre, envoi après la réponse et seulement à une adresse
 * admise ; un lien faux compte comme un code faux pour l'IP.
 *
 * Ce que porte le lien : un jeton, l'adresse et un aléa chiffrés ensemble par
 * une clé tirée d'AUTH_SECRET (AES-256-GCM). L'adresse est dans le jeton parce
 * que la base n'en garde que l'empreinte, et chiffrée parce qu'une adresse en
 * clair dans une URL finit dans les journaux de l'hébergeur et l'historique du
 * navigateur. La base garde l'empreinte de l'aléa, comme celle d'un code :
 * une fuite de la base ne connecte personne, et le chiffrement authentifié
 * refuse un jeton retouché.
 */

// 15 minutes, plus que le code (10) : le lien s'ouvre depuis la messagerie,
// souvent sur le téléphone, parfois longtemps après la demande faite à
// l'ordinateur. Au-delà, un lien qui traîne dans une boîte ouvrirait une
// session à qui la lit.
export const DUREE_VALIDITE_LIEN_MINUTES = 15;

// La page de confirmation, où mène le lien. Ouverte sans session, comme tout
// /connexion (protection.ts).
export const CHEMIN_LIEN = "/connexion/lien";

// Au-delà, le chemin de retour s'abandonne : un lien de mail trop long se
// coupe dans certaines messageries. Un jeton d'adresse de 254 caractères en
// fait moins de 450.
const LONGUEUR_MAX_RETOUR = 500;
const LONGUEUR_MAX_JETON = 1000;

// 24 octets d'aléa, 32 caractères en base64url : la longueur qui sépare
// l'aléa de l'adresse dans le jeton déchiffré.
const ALEA_OCTETS = 24;
const ALEA_CARACTERES = 32;
const IV_OCTETS = 12;
const ETIQUETTE_OCTETS = 16;

export type ResultatLien = "connecte" | "expire" | "acces" | "limite";

/*
 * L'adresse du site où mène le lien. En production, URL_PUBLIQUE seule (la
 * même variable que src/lib/referencement.ts, lue de la même façon : https,
 * sans chemin), jamais l'en-tête Host de la requête : un tiers qui l'écrit
 * ferait envoyer à une personne un lien vers son propre site, et y
 * recueillerait le jeton. Hors production, l'hôte de la requête, pour que le
 * lien du mail affiché dans la console s'ouvre sur le poste.
 *
 * Lue ici et non importée : referencement.ts importe la navigation de
 * l'appli, que la brique ne connaît pas.
 */
export function adresseDesLiens(enTetes: Headers): URL | null {
  if (process.env.NODE_ENV === "production") {
    const valeur = process.env.URL_PUBLIQUE?.trim();
    if (!valeur) return null;
    try {
      const url = new URL(valeur);
      return url.protocol === "https:" && url.pathname === "/" && url.search === "" && url.hash === "" ? url : null;
    } catch {
      return null;
    }
  }
  const hote = enTetes.get("host");
  if (!hote) return null;
  try {
    return new URL(`http://${hote}`);
  } catch {
    return null;
  }
}

// La clé de chiffrement des jetons, tirée d'AUTH_SECRET : distincte de la clé
// des empreintes et de celle des sessions, sans variable de plus à déclarer.
function cleDeChiffrement(secret: string): Buffer {
  return createHmac("sha256", secret).update("cle:lien-email").digest();
}

function empreinteDuLien(secret: string, adresse: string, alea: string): string {
  return empreinte(secret, `lien:${adresse}:${alea}`);
}

function chiffrer(secret: string, adresse: string, alea: string): string {
  const iv = randomBytes(IV_OCTETS);
  const chiffreur = createCipheriv("aes-256-gcm", cleDeChiffrement(secret), iv);
  const chiffre = Buffer.concat([chiffreur.update(`${alea}${adresse}`, "utf-8"), chiffreur.final()]);
  return Buffer.concat([iv, chiffre, chiffreur.getAuthTag()]).toString("base64url");
}

// L'adresse et l'aléa du jeton, ou null : retouché, inventé, d'un autre
// AUTH_SECRET ou trop long. Aucune erreur ne remonte.
function dechiffrer(secret: string, jeton: string): { adresse: string; alea: string } | null {
  if (jeton.length === 0 || jeton.length > LONGUEUR_MAX_JETON || !/^[A-Za-z0-9_-]+$/.test(jeton)) return null;
  const octets = Buffer.from(jeton, "base64url");
  if (octets.length <= IV_OCTETS + ETIQUETTE_OCTETS) return null;
  try {
    const dechiffreur = createDecipheriv("aes-256-gcm", cleDeChiffrement(secret), octets.subarray(0, IV_OCTETS));
    dechiffreur.setAuthTag(octets.subarray(octets.length - ETIQUETTE_OCTETS));
    const clair = Buffer.concat([
      dechiffreur.update(octets.subarray(IV_OCTETS, octets.length - ETIQUETTE_OCTETS)),
      dechiffreur.final(),
    ]).toString("utf-8");
    const alea = clair.slice(0, ALEA_CARACTERES);
    const adresse = clair.slice(ALEA_CARACTERES);
    return adresse ? { adresse, alea } : null;
  } catch {
    return null;
  }
}

// Le lien du mail. Le retour n'y figure que s'il mène ailleurs qu'à l'accueil ;
// il n'est pas secret, et se refiltre à l'envoi du bouton.
function lienDeConnexion(origine: URL, jeton: string, retour: string): string {
  const lien = new URL(CHEMIN_LIEN, origine);
  lien.searchParams.set("jeton", jeton);
  if (retour !== "/" && retour.length <= LONGUEUR_MAX_RETOUR) lien.searchParams.set("retour", retour);
  return lien.href;
}

/*
 * Écrit une demande de lien, ou refuse si une limite est atteinte, sans
 * chercher à savoir si l'adresse est admise : cela se fait après la réponse,
 * avec l'envoi, comme pour le code. `origine` vient d'adresseDesLiens, `ip`
 * d'adresseDuVisiteur (null, et le plafond de toute l'appli : voir
 * demanderUnCode).
 */
export async function demanderUnLien(
  email: string,
  ip: string | null,
  origine: URL,
  retour: string,
  planifier: Planifier,
  contexte = contexteDeLAppli()
): Promise<ResultatDemande> {
  const adresse = normaliser(email);
  const secret = secretDeSession();
  const alea = randomBytes(ALEA_OCTETS).toString("base64url");
  const acceptee = await enregistrerUneDemande(
    secret,
    adresse,
    ip,
    empreinteDuLien(secret, adresse, alea),
    DUREE_VALIDITE_LIEN_MINUTES
  );
  if (acceptee === "limite") return "limite";
  // Au plafond de toute l'appli, la réponse d'une adresse inconnue : rien ne part.
  if (acceptee === "plafond") return "envoye";
  const lien = lienDeConnexion(origine, chiffrer(secret, adresse, alea), cheminDeRetour(retour));
  planifier(() => envoyerSiAdmis(adresse, lien, contexte));
  return "envoye";
}

async function envoyerSiAdmis(adresse: string, lien: string, contexte: ContexteEntree): Promise<void> {
  try {
    if (!(await seraitAdmis(adresse, contexte))) return;
    await envoyerMail({
      a: adresse,
      objet: "Votre lien de connexion",
      contenu: [
        { paragraphe: "Pour vous connecter, ouvrez ce lien puis appuyez sur « Me connecter » :" },
        { lien: { libelle: "Ouvrir la page de connexion", url: lien } },
        {
          paragraphe: `Valable ${DUREE_VALIDITE_LIEN_MINUTES} minutes, pour une seule connexion, sur l'appareil où vous appuyez sur le bouton.`,
        },
        {
          paragraphe:
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : personne ne peut se connecter sans ce lien.",
        },
      ],
    });
  } catch (erreur) {
    // Ni l'adresse ni le lien dans le journal, comme pour le code.
    console.error(
      "Brique comptes : l'envoi d'un lien de connexion a échoué :",
      erreur instanceof Error ? erreur.message : "erreur inconnue"
    );
  }
}

// La demande en cours de l'adresse, comme pour le code : une nouvelle demande
// marque les précédentes consommées, il en reste une au plus.
const DEMANDE_EN_COURS = `FROM codes_connexion
  WHERE adresse_empreinte = $1 AND NOT consomme AND expire_le > now()
  ORDER BY cree_le DESC, id DESC
  LIMIT 1`;

// Comparaison à temps constant, comme pour le code.
function memeEmpreinte(enBase: string, attendue: string): boolean {
  return timingSafeEqual(Buffer.from(enBase, "hex"), Buffer.from(attendue, "hex"));
}

/*
 * Ce que montre la page du lien, à son ouverture (GET) : LIT seulement. Ni
 * consommé, ni compté comme un essai : l'antivirus qui ouvre le lien avant la
 * personne ne doit rien changer. Un jeton de 192 bits d'aléa, chiffré et
 * authentifié, ne se devine pas : lire sans limite ne donne rien à sonder.
 */
export async function etatDuLien(jeton: string): Promise<"valide" | "expire"> {
  return (await adresseDuLien(jeton)) === null ? "expire" : "valide";
}

// L'adresse d'un lien qui vaut encore, ou null, sans rien écrire : la page de
// confirmation l'affiche, pour que la personne voie avec quel compte elle va
// entrer. Qui tient le lien peut se connecter avec : la lui montrer ne lui
// apprend rien de plus.
export async function adresseDuLien(jeton: string): Promise<string | null> {
  const secret = secretDeSession();
  const lu = dechiffrer(secret, jeton);
  if (!lu) return null;
  const ligne = await queryOne<{ code_empreinte: string }>(`SELECT code_empreinte ${DEMANDE_EN_COURS}`, [
    empreinteDeLAdresse(secret, lu.adresse),
  ]);
  return ligne && memeEmpreinte(ligne.code_empreinte, empreinteDuLien(secret, lu.adresse, lu.alea)) ? lu.adresse : null;
}

/*
 * L'envoi du bouton « Me connecter » (POST) : consomme le lien et ouvre la
 * session si l'adresse entre encore. « expire » couvre le lien déjà servi,
 * remplacé, périmé ou faux : dans tous les cas, il n'y a qu'à en redemander
 * un. Un lien faux compte pour une saisie fausse de l'IP, comme un code faux.
 */
export async function connecterParLien(
  jeton: string,
  ip: string | null,
  contexte = contexteDeLAppli()
): Promise<ResultatLien> {
  const secret = secretDeSession();
  const verification = await sousLaLimiteDeLIp(secret, ip, async (client, echec) => {
    const lu = dechiffrer(secret, jeton);
    if (!lu) return echec(null);
    const ligne = await client.queryOne<{ id: number; code_empreinte: string }>(
      `SELECT id, code_empreinte ${DEMANDE_EN_COURS} FOR UPDATE`,
      [empreinteDeLAdresse(secret, lu.adresse)]
    );
    // Un lien d'une demande remplacée, ou un code en cours pour l'adresse :
    // rien n'est touché, la demande en cours reste valable.
    if (!ligne || !memeEmpreinte(ligne.code_empreinte, empreinteDuLien(secret, lu.adresse, lu.alea)))
      return echec(null);
    await client.query("UPDATE codes_connexion SET consomme = true WHERE id = $1", [ligne.id]);
    return lu.adresse;
  });
  if (verification === "limite") return "limite";
  if (verification === null) return "expire";
  const compte = await admettre(verification, contexte);
  if (!compte) return "acces";
  await ouvrirSession(compte);
  return "connecte";
}
