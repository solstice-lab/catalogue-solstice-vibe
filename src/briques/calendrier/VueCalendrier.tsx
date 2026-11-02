import { EtatVide, GrilleMois, ListeCartes, NavigationMois } from "@/ui";
import { date, jourSemaineCourt, moisAnnee } from "@/lib/format";
import type { Intitules } from "./branchement";
import { construireSemaines, moisPrecedent, moisSuivant, type Evenement } from "./calcul";

/*
 * La vue du calendrier : la grille du mois sur ordinateur, la liste des
 * événements du mois en cartes sur téléphone (une grille de sept colonnes y
 * est illisible). Les liens de navigation prennent le mois dans l'adresse
 * (`?mois=aaaa-mm`) : la page, qui connaît sa propre adresse, n'a rien à
 * passer. Rendue côté serveur : aucune interaction à porter côté client.
 */
export function VueCalendrier({
  mois,
  evenements,
  intitules,
  aujourdhui,
}: {
  mois: string;
  evenements: Evenement[];
  intitules: Intitules;
  aujourdhui: string;
}) {
  const titre = moisAnnee(mois);
  const moisCourant = aujourdhui.slice(0, 7);
  const semaines = construireSemaines(mois, evenements, aujourdhui);

  return (
    <>
      <NavigationMois
        titre={titre}
        hrefPrecedent={`?mois=${moisPrecedent(mois)}`}
        hrefSuivant={`?mois=${moisSuivant(mois)}`}
        hrefAujourdhui={mois === moisCourant ? undefined : `?mois=${moisCourant}`}
      />
      {evenements.length === 0 ? (
        <EtatVide
          titre={`Pas de ${intitules.entites} en ${titre}`}
          description="Changer de mois pour consulter les autres."
        />
      ) : (
        <>
          <div className="sl-seulement-ordinateur">
            <GrilleMois
              titre={`${intitules.entites} : ${titre}`}
              entetes={semaines[0].map((cellule) => jourSemaineCourt(cellule.date))}
              semaines={semaines}
              cle={(evenement) => evenement.lien}
              libelle={(evenement) => evenement.libelle}
              lien={(evenement) => evenement.lien}
            />
          </div>
          <div className="sl-seulement-telephone">
            <ListeCartes
              elements={evenements}
              cle={(evenement) => evenement.lien}
              titre={(evenement) => evenement.libelle}
              champs={[
                { libelle: intitules.date, valeur: (evenement) => date(evenement.date), chiffres: true },
                ...(intitules.detail ? [{ libelle: intitules.detail, valeur: (e: Evenement) => e.detail }] : []),
              ]}
              lien={(evenement) => evenement.lien}
            />
          </div>
        </>
      )}
    </>
  );
}
