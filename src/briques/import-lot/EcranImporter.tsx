import { Carte, EtatVide } from "@/ui";
import { aujourdhui } from "@/lib/format";
import { verifierEcran, type Branchement } from "./branchement";
import { FormulaireEnvoi } from "./FormulaireEnvoi";
import { OCTETS_MAX } from "./lecture";
import { ListeLots } from "./ListeLots";
import type { listerLots } from "./lot";
import { cheminDe, textesDe } from "./presentation";

/*
 * La page « Importer » : l'envoi d'un fichier et la liste des lots. Composant
 * serveur, à placer dans l'AppLayout de la page de l'appli, après son garde
 * de droits. `lots` vient de listerLots(branchement.id).
 */
export function EcranImporter({
  branchement,
  lots,
}: {
  branchement: Branchement;
  lots: Awaited<ReturnType<typeof listerLots>>;
}) {
  verifierEcran(branchement);
  const chemin = cheminDe(branchement);
  const textes = textesDe(branchement);
  const affiches = lots.map((lot) => ({
    id: lot.id,
    nomFichier: lot.nomFichier,
    statut: lot.statut,
    // Le jour dans le fuseau du client, comme partout (lib/format.ts) : un
    // instant UTC lu tel quel afficherait la veille après minuit.
    creeLe: aujourdhui(lot.creeLe),
  }));

  return (
    <>
      <Carte titre="Envoyer un fichier">
        <FormulaireEnvoi chemin={chemin} libelle={textes.fichier} megaOctetsMax={OCTETS_MAX / 1024 / 1024} />
      </Carte>
      <Carte titre="Lots d'import">
        {affiches.length === 0 ? (
          <EtatVide
            titre="Aucun fichier envoyé pour l'instant"
            description={`Chaque fichier devient un lot à relire : rien ne s'écrit ${textes.dansLEntite} avant que vous le confirmiez.`}
          />
        ) : (
          <ListeLots lots={affiches} chemin={chemin} idTableau={`import-${branchement.id}-lots`} />
        )}
      </Carte>
    </>
  );
}
