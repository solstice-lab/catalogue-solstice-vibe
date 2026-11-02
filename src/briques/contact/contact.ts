import { envoyerMail, type Bloc } from "@/briques/mails/envoi";
import { nombre } from "@/lib/format";
import { adresseDuVisiteur, empreinteDe } from "@/lib/adresse-ip";
import { CHAMPS, LONGUEUR_MAX, type EtatContact, type ValeursContact } from "./champs";
import { libererUnEnvoi, reserverUnEnvoi, vientDUnRobot } from "./filtres";

export type { EtatContact } from "./champs";

/*
 * Le traitement d'un message du formulaire de contact, côté
 * serveur. Le message part par e-mail et n'est pas gardé : la base ne garde
 * que les traces de la limite d'envois (filtres.ts).
 */

// Même réponse que le message soit parti ou filtré comme robot : la réponse
// ne dit pas au robot quel filtre l'a arrêté.
const ENVOYE: EtatContact = { envoye: true };

// La règle de la brique mails, qui revérifie l'adresse : la tester ici rend
// une erreur au visiteur au lieu d'un échec d'envoi.
const ADRESSE = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]+$/;

// Limite atteinte : le dire, plutôt qu'un faux succès. Si l'adresse IP est
// mal lue derrière l'hébergeur (src/lib/adresse-ip.ts), des visiteurs
// partagent la même limite, et un faux succès ferait disparaître leurs
// messages sans que personne le voie. Un robot n'apprend rien qu'il ne sache
// déjà.
const LIMITE_ATTEINTE = "Trop de messages ont été envoyés en peu de temps. Réessayez dans une heure.";

function texte(donnees: FormData, champ: string): string {
  const valeur = donnees.get(champ);
  return typeof valeur === "string" ? valeur : "";
}

function erreurDeSaisie({ nom, adresse, message }: ValeursContact): string | null {
  if (nom.trim() === "" || /[\r\n]/.test(nom) || nom.length > LONGUEUR_MAX.nom) {
    return `Indiquez votre nom, sur une ligne (${LONGUEUR_MAX.nom} caractères au plus).`;
  }
  if (!ADRESSE.test(adresse.trim()) || adresse.length > LONGUEUR_MAX.adresse) {
    return "Indiquez une adresse e-mail valide, pour recevoir la réponse.";
  }
  if (message.trim() === "" || message.length > LONGUEUR_MAX.message) {
    return `Écrivez votre message (${nombre(LONGUEUR_MAX.message)} caractères au plus).`;
  }
  return null;
}

// Lu à chaque message, pas au chargement : un réglage changé chez l'hébergeur
// vaut au redémarrage. Sans destinataire, le message partirait nulle part en
// passant pour reçu : l'erreur nomme la variable.
function destinataire(): string {
  const adresse = (process.env.CONTACT_DESTINATAIRE ?? "").trim();
  if (adresse === "") {
    throw new Error(
      "Brique contact : CONTACT_DESTINATAIRE n'est pas renseignée. Y mettre l'adresse qui reçoit les messages du formulaire."
    );
  }
  return adresse;
}

// Une ligne du message, un paragraphe du mail : le gabarit de la brique mails
// ne rend pas les sauts de ligne.
function corpsDuMail({ nom, adresse, message }: ValeursContact): Bloc[] {
  const lignes = message
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "");
  return [
    { paragraphe: `Nom : ${nom.trim()}` },
    { paragraphe: `Adresse : ${adresse.trim()}` },
    { paragraphe: "Message :" },
    ...lignes.map((ligne) => ({ paragraphe: ligne })),
  ];
}

export async function traiterMessageContact(donnees: FormData, enTetes: Pick<Headers, "get">): Promise<EtatContact> {
  if (vientDUnRobot(donnees, Date.now())) return ENVOYE;

  const valeurs: ValeursContact = {
    nom: texte(donnees, CHAMPS.nom),
    adresse: texte(donnees, CHAMPS.adresse),
    message: texte(donnees, CHAMPS.message),
  };
  const erreur = erreurDeSaisie(valeurs);
  if (erreur) return { erreur, valeurs };

  const a = destinataire();
  // Sans adresse (production sans IP_EN_TETE_CLIENT), pas de limite par
  // adresse : le plafond global reste (filtres.ts).
  const ip = adresseDuVisiteur(enTetes);
  const empreinte = ip === null ? null : empreinteDe(ip);
  if (!(await reserverUnEnvoi(empreinte))) return { erreur: LIMITE_ATTEINTE, valeurs };

  try {
    await envoyerMail({
      a,
      // Fixe, jamais le nom saisi : rien de ce que tape le visiteur n'entre
      // dans un en-tête du mail, hors l'adresse de réponse que la brique
      // mails vérifie.
      objet: "Nouveau message de contact",
      contenu: corpsDuMail(valeurs),
      repondreA: valeurs.adresse.trim(),
    });
  } catch (cause) {
    // Le journal de l'hébergeur ne reçoit jamais le message ni l'adresse du
    // visiteur : seulement la raison de l'échec, que la brique mails écrit
    // sans adresse ni clé.
    console.error(`[contact] Message non envoyé : ${cause instanceof Error ? cause.message : String(cause)}`);
    await libererUnEnvoi(empreinte);
    return { erreur: "Votre message n'est pas parti. Réessayez dans quelques minutes.", valeurs };
  }
  return ENVOYE;
}
