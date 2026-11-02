import { ErreurEnvoi, type Envoyeur } from "./message";

/*
 * L'envoyeur Resend, seul fichier qui connaît ce fournisseur. Un appel HTTP
 * direct plutôt que le paquet `resend` :
 * l'envoi tient en une requête, et chaque paquet ajouté passe par l'audit de
 * la CI. API vérifiée dans la documentation de Resend le 2026-10-22.
 */

const ADRESSE_API = "https://api.resend.com/emails";

// Au-delà, l'appelant reçoit une erreur plutôt qu'une requête qui pend.
const DELAI_MS = 10_000;

// La clé ne sort jamais dans un message d'erreur, même si Resend ou la pile
// réseau la renvoie : le message finit dans les journaux de l'hébergeur. Les
// adresses du mail non plus, données personnelles que Resend peut citer.
function masquer(texte: string, valeurs: (string | undefined)[]): string {
  return valeurs.reduce<string>((resultat, valeur) => (valeur ? resultat.split(valeur).join("***") : resultat), texte);
}

export function creerEnvoyeurResend(reglages: { cle: string | undefined; expediteur: string | undefined }): Envoyeur {
  const cle = reglages.cle?.trim();
  const expediteur = reglages.expediteur?.trim();
  if (!cle)
    throw new ErreurEnvoi(
      "RESEND_API_KEY n'est pas renseignée : le fournisseur « resend » ne peut rien envoyer sans elle."
    );
  if (!expediteur)
    throw new ErreurEnvoi("MAILS_EXPEDITEUR n'est pas renseignée : une adresse du domaine vérifié chez Resend.");

  return {
    async envoyer(mail) {
      const aMasquer = [cle, mail.a, mail.repondreA];
      let reponse: Response;
      try {
        reponse = await fetch(ADRESSE_API, {
          method: "POST",
          headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: expediteur,
            to: [mail.a],
            subject: mail.objet,
            html: mail.html,
            text: mail.texte,
            ...(mail.repondreA ? { reply_to: mail.repondreA } : {}),
          }),
          signal: AbortSignal.timeout(DELAI_MS),
        });
      } catch (erreur) {
        // Pas de `cause` : l'erreur d'origine pourrait porter la clé.
        const detail = erreur instanceof Error ? erreur.message : String(erreur);
        throw new ErreurEnvoi(`Resend injoignable (${masquer(detail, aMasquer)}).`);
      }

      const corps = (await reponse.json().catch(() => null)) as {
        id?: unknown;
        name?: unknown;
        message?: unknown;
      } | null;
      if (!reponse.ok) {
        const detail = [corps?.name, corps?.message].filter((part) => typeof part === "string").join(" : ");
        throw new ErreurEnvoi(
          `Resend a refusé l'envoi (HTTP ${reponse.status}${detail ? `, ${masquer(detail, aMasquer)}` : ""}).`
        );
      }
      return { id: typeof corps?.id === "string" ? corps.id : null };
    },
  };
}
