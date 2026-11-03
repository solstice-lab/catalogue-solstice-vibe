import { transaction } from "@/lib/db/client";
import { envoyerMail } from "@/briques/mails/envoi";
import { ESPACES } from "@/config/espaces";
import { afficherCode, lienPourRejoindre } from "./code";
import type { RetourEspace } from "./domaine";
import { gestionnaireDe } from "./espaces";
import { majuscule } from "./reglages";

/*
 * L'invitation par e-mail d'un espace, par la brique mails. Serveur seulement.
 *
 * Dans une appli à entrée ouverte, n'importe qui crée un compte, puis un
 * espace : sans plafond, l'appli deviendrait un relais d'envoi vers n'importe
 * quelle adresse (ticket de la brique). D'où :
 * - un seul destinataire par invitation, et aucun texte libre : le mail ne
 *   porte que le prénom de qui invite et le nom de l'espace, contrôlés à la
 *   saisie (saisie.ts), jamais dans l'objet ;
 * - deux plafonds sur 24 heures glissantes, par espace et pour l'appli,
 *   comptés en base sous verrou (cicatrice d'un projet précédent : une limite
 *   tenue en mémoire ne valait qu'avec un seul processus) ;
 * - l'invitation se compte AVANT l'envoi et reste comptée s'il échoue : des
 *   échecs répétés ne contournent pas le plafond.
 * Le mail part hors de la transaction : le verrou ne s'attend pas pendant
 * l'appel au prestataire.
 */

// Une adresse, une seule : ni virgule, ni espace, ni saut de ligne. La brique
// mails la revérifie ; ici, une adresse illisible est refusée avant d'être comptée.
const ADRESSE = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]+$/;

export type ContexteInvitation = {
  nomDeLAppli: string;
  /** L'adresse publique de l'appli ; null en local ou sur une recette : le mail part sans lien. */
  site: URL | null;
};

export async function inviterParEmail(
  personne: { email: string },
  espaceId: number,
  saisie: string,
  contexte: ContexteInvitation
): Promise<RetourEspace> {
  const adresse = saisie.trim().toLowerCase();
  if (!ADRESSE.test(adresse)) {
    return { erreur: "Ce n'est pas une adresse e-mail valide : une seule adresse par invitation." };
  }
  const v = ESPACES.vocabulaire;
  const comptee = await transaction(async (tx) => {
    const acteur = await gestionnaireDe(tx, personne, espaceId);
    if ("erreur" in acteur) return acteur;
    // Le plafond de l'appli se compte sur tous les espaces : un seul verrou
    // pour toutes les invitations, pris après celui de l'espace.
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["espaces:invitations"]);
    // Au-delà de 24 heures, une invitation ne compte plus : elle part, celles
    // de tous les espaces, à chaque invitation. La table reste un compteur.
    await tx.query("DELETE FROM espaces_invitations WHERE envoyee_le <= now() - interval '24 hours'");
    const [compte] = await tx.query<{ espace: number; appli: number }>(
      `SELECT count(*) FILTER (WHERE espace_id = $1)::int AS espace, count(*)::int AS appli
         FROM espaces_invitations WHERE envoyee_le > now() - interval '24 hours'`,
      [espaceId]
    );
    if (compte.espace >= ESPACES.plafonds.invitationsParEspaceParJour) {
      return {
        erreur: `${majuscule(v.ce)} a envoyé ${compte.espace} invitations en 24 heures, son plafond : réessayez plus tard, ou transmettez le code vous-même.`,
      };
    }
    if (compte.appli >= ESPACES.plafonds.invitationsParJour) {
      return {
        erreur:
          "L'appli a envoyé toutes les invitations qu'elle envoie en 24 heures : réessayez plus tard, ou transmettez le code vous-même.",
      };
    }
    await tx.query("INSERT INTO espaces_invitations (espace_id) VALUES ($1)", [espaceId]);
    const [espace] = await tx.query<{ nom: string; code: string }>("SELECT nom, code FROM espaces WHERE id = $1", [
      espaceId,
    ]);
    return { ...espace, prenom: acteur.prenom };
  });
  if ("erreur" in comptee) return comptee;

  const { nom, code, prenom } = comptee;
  try {
    await envoyerMail({
      a: adresse,
      objet: `Invitation à rejoindre ${v.un} sur ${contexte.nomDeLAppli}`,
      contenu: [
        { paragraphe: `${prenom} vous invite à rejoindre ${v.le} « ${nom} » sur ${contexte.nomDeLAppli}.` },
        { paragraphe: `Connectez-vous avec cette adresse e-mail, puis saisissez ce code pour rejoindre ${v.le} :` },
        { code: afficherCode(code) },
        ...(contexte.site
          ? [{ lien: { libelle: `Rejoindre ${v.le}`, url: lienPourRejoindre(contexte.site, code) } }]
          : []),
        { paragraphe: `Si vous ne connaissez pas ${prenom}, ignorez ce message : rien ne se fait sans vous.` },
      ],
    });
  } catch {
    return {
      erreur: `L'invitation est comptée, mais le mail n'est pas parti : transmettez le code à ${adresse} vous-même.`,
    };
  }
  return { message: `Invitation envoyée à ${adresse}.` };
}
