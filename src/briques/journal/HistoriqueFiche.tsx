import { Carte, EtatVide } from "@/ui";
import { historiqueSiPermis } from "./journal";
import { TableauJournal } from "./TableauJournal";

// L'historique sous les champs d'une fiche, pour qui a
// journal.consulter ; rien pour les autres. Une section annexe : la fiche
// reste en lecture seule, et ses champs restent ceux du formulaire.
export async function HistoriqueFiche({ entite, entiteId }: { entite: string; entiteId: string | number }) {
  const lignes = await historiqueSiPermis(entite, entiteId);
  if (lignes === null) return null;
  return (
    <Carte titre="Historique">
      {lignes.length === 0 ? (
        <EtatVide
          titre="Aucune trace"
          description="Les gestes faits avant la mise en place du journal n'y figurent pas."
        />
      ) : (
        // L'id ne dérive pas de la fiche : la vue (tri, filtres) est celle de
        // toutes les fiches de l'entité.
        <TableauJournal id={`historique-${entite}`} lignes={lignes} avecEntite={false} />
      )}
    </Carte>
  );
}
