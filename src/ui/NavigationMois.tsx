import { LienBouton } from "./LienBouton";

/**
 * Le titre d'un calendrier mensuel et ses liens vers le mois d'avant, le mois
 * d'après et, hors du mois courant, vers aujourd'hui. Des liens (adresse
 * `?mois=…`) et non des boutons : le mois consulté se partage et survit au
 * rechargement. Visible sur téléphone comme sur ordinateur.
 */
export function NavigationMois({
  titre,
  hrefPrecedent,
  hrefSuivant,
  hrefAujourdhui,
}: {
  /** « octobre 2026 ». */
  titre: string;
  hrefPrecedent: string;
  hrefSuivant: string;
  /** Absent quand le mois affiché est déjà le mois courant. */
  hrefAujourdhui?: string;
}) {
  return (
    <nav className="sl-navigation-mois" aria-label="Changer de mois">
      <span className="sl-navigation-mois-titre">{titre}</span>
      <span className="sl-rangee-actions">
        <LienBouton variante="secondaire" href={hrefPrecedent}>
          Mois précédent
        </LienBouton>
        {hrefAujourdhui && (
          <LienBouton variante="secondaire" href={hrefAujourdhui}>
            Aujourd&apos;hui
          </LienBouton>
        )}
        <LienBouton variante="secondaire" href={hrefSuivant}>
          Mois suivant
        </LienBouton>
      </span>
    </nav>
  );
}
