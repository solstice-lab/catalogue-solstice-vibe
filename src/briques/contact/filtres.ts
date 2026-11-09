import { transaction } from "@/lib/db/client";
import { CHAMPS } from "./champs";

/*
 * Les trois filtres anti-spam, sans service tiers ni captcha :
 * un champ piège, un délai minimal de remplissage, une limite d'envois. La
 * limite vit en base, pas en mémoire : chez l'hébergeur, plusieurs processus
 * servent l'appli, et chacun aurait compté de son côté.
 */

// Un humain ne lit pas la page, ne tape pas son nom, son adresse et un
// message en moins de 3 secondes ; un robot générique poste aussitôt.
export const DELAI_MINIMAL_MS = 3_000;

// Sur une heure glissante. Assez pour qu'un visiteur qui se reprend ne soit
// pas bloqué, assez peu pour qu'un robot ne remplisse pas la boîte.
export const FENETRE_S = 3_600;
export const LIMITE_PAR_IP = 5;
// Toutes adresses confondues : un robot qui change d'adresse IP à chaque envoi
// épuiserait sinon le quota du fournisseur d'envoi et la boîte du client. Il
// borne aussi la table à quelques dizaines de lignes, d'où l'absence d'index.
export const PLAFOND_GLOBAL = 50;

// L'heure que la page écrit dans le formulaire, relue à la soumission.
export function heureDAffichage(): number {
  return Date.now();
}

/*
 * Le champ piège rempli, ou un formulaire posté trop vite. Les robots
 * génériques renvoient les champs cachés tels qu'ils les ont reçus : l'heure
 * n'est pas signée. Un robot qui la forge reste borné par la limite par IP.
 * Une heure absente, illisible ou dans le futur vient d'un robot aussi : le
 * navigateur renvoie celle que la page a écrite.
 */
export function vientDUnRobot(donnees: FormData, maintenant: number): boolean {
  const piege = donnees.get(CHAMPS.piege);
  if (typeof piege === "string" && piege !== "") return true;
  const brute = donnees.get(CHAMPS.afficheLe);
  const afficheLe = typeof brute === "string" && /^\d+$/.test(brute) ? Number(brute) : NaN;
  if (!Number.isFinite(afficheLe) || afficheLe > maintenant) return true;
  return maintenant - afficheLe < DELAI_MINIMAL_MS;
}

// La ligne d'un envoi sans adresse (production sans IP_EN_TETE_CLIENT) : elle
// compte dans le plafond global, jamais dans une limite par adresse.
const SANS_ADRESSE = "sans-adresse";

/*
 * Réserve un envoi pour cette empreinte, ou refuse si la limite est atteinte.
 * Sans empreinte, seul le plafond global s'applique.
 * Seuls les envois acceptés sont comptés : un robot qui insisterait sur
 * l'adresse d'un visiteur (même réseau d'entreprise) n'allongerait pas son
 * blocage, et ne remplirait pas le plafond global à lui seul.
 */
export async function reserverUnEnvoi(empreinte: string | null): Promise<boolean> {
  return transaction(async (client) => {
    // Un seul verrou pour tout le formulaire, le temps de la transaction :
    // sans lui, deux soumissions simultanées lisent le même compte et passent
    // toutes deux sous la limite. Le formulaire reçoit quelques messages par
    // heure, les attendre l'une après l'autre ne coûte rien.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('contact_envois'))`);
    // La purge des traces se fait ici, à chaque message. Sans nouveau message,
    // les traces de plus d'une heure restent en base (au plus PLAFOND_GLOBAL
    // lignes) jusqu'au script de purge de la brique rgpd, qui lit la même
    // durée dans confidentialite.ts (clé contact-envois).
    await client.query(`DELETE FROM contact_envois WHERE recu_le < now() - make_interval(secs => $1)`, [FENETRE_S]);
    const compte = await client.queryOne<{ adresse: number; total: number }>(
      `SELECT count(*) FILTER (WHERE empreinte = $1)::int AS adresse, count(*)::int AS total FROM contact_envois`,
      [empreinte ?? SANS_ADRESSE]
    );
    if (!compte || compte.total >= PLAFOND_GLOBAL) return false;
    if (empreinte !== null && compte.adresse >= LIMITE_PAR_IP) return false;
    // Quand le message qui remplit le plafond passe, sans donnée personnelle :
    // quelques adresses, ou une production sans adresse lisible, le saturaient
    // sans que rien ne le dise (audit du 2026-11-09). Les refusés n'écrivent
    // rien, un journal à chacun grossirait sans fin ; sous un plafond tenu
    // plein, chaque place reprise le redit, au plus PLAFOND_GLOBAL fois par heure.
    if (compte.total + 1 === PLAFOND_GLOBAL) {
      console.warn(
        `Brique contact : le plafond de ${PLAFOND_GLOBAL} messages par heure, toutes adresses confondues, est atteint. Jusqu'à ce qu'une place se libère, le formulaire répond « Réessayez dans une heure » et aucun message ne part. Si ce sont de vrais visiteurs, relever PLAFOND_GLOBAL (src/briques/contact/filtres.ts).`
      );
    }
    await client.query(`INSERT INTO contact_envois (empreinte) VALUES ($1)`, [empreinte ?? SANS_ADRESSE]);
    return true;
  });
}

/*
 * Rend la place d'un envoi qui n'est pas parti (fournisseur en panne) : sans
 * cela, un visiteur qui réessaie épuisait sa limite sur des échecs, puis lisait
 * « Trop de messages », et les échecs remplissaient le plafond global. Une
 * seule ligne, la plus récente de cette empreinte : celle que la réservation
 * vient d'écrire.
 */
export async function libererUnEnvoi(empreinte: string | null): Promise<void> {
  await transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('contact_envois'))`);
    await client.query(
      `DELETE FROM contact_envois WHERE ctid = (SELECT ctid FROM contact_envois WHERE empreinte = $1 ORDER BY recu_le DESC LIMIT 1)`,
      [empreinte ?? SANS_ADRESSE]
    );
  });
}
