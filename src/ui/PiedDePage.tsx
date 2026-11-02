import Link from "next/link";

/**
 * Le pied de toute page : signature Solstice Lab, liens des mentions légales
 * et de la confidentialité. Interne au kit, jamais exporté : seuls les
 * squelettes (`AppLayout`, `PageVitrine`) le posent, pour qu'aucune page ne
 * puisse l'oublier. Une livraison Solstice Lab garde la signature, même pour
 * un prototype : c'est une règle de l'agence, pas de la licence du catalogue.
 */
export function PiedDePage() {
  return (
    <footer className="sl-signature">
      <span className="sl-signature-logo" aria-hidden />
      <span>
        Conçu par{" "}
        <a href="https://solstice-lab.com" target="_blank" rel="noopener">
          Solstice Lab
        </a>{" "}
        · Data &amp; AI · {new Date().getFullYear()}
      </span>
      {/* Ici et non dans chaque page, comme la signature : une page qui
          les oublierait laisserait le site sans mentions légales (LCEN)
          ni politique de confidentialité (RGPD). Les deux pages
          appartiennent au socle et l'assembleur les garde dans toute appli. */}
      <span className="sl-signature-liens">
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/confidentialite">Confidentialité</Link>
      </span>
    </footer>
  );
}
