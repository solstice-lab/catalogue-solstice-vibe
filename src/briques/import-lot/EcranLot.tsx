import { Carte } from "@/ui";
import { ActionsLot, type ActionsDuLot } from "./ActionsLot";
import { BadgeStatutLot } from "./BadgeStatutLot";
import { verifierEcran, type Branchement } from "./branchement";
import type { Lot } from "./lot";
import { cheminDe, colonnesRetenues, fusionsAffichees, lignesRetenues, textesDe, titreDeLaCle } from "./presentation";
import { TableauEcartees, TableauFusions, TableauRetenues } from "./TableauxLot";

/*
 * La page d'un lot : son statut et ses gestes, les lignes retenues, les lignes
 * écartées avec leur numéro, les fusions. Composant serveur, à placer dans
 * l'AppLayout de la page de l'appli, après son garde de droits. `lot` vient de
 * lotDeLaPage (gestes.ts) ; `actions`, des server actions de l'appli, chacune
 * gardée. Les fonctions du branchement s'appellent ici, sur le serveur : le
 * client ne reçoit que des chaînes.
 */
export function EcranLot({ branchement, lot, actions }: { branchement: Branchement; lot: Lot; actions: ActionsDuLot }) {
  verifierEcran(branchement);
  const textes = textesDe(branchement);
  const idTableau = `import-${branchement.id}`;
  const retenues = lignesRetenues(branchement, lot);
  const fusions = fusionsAffichees(lot);

  return (
    <>
      <Carte titre={lot.nomFichier} actions={<BadgeStatutLot statut={lot.statut} />}>
        {lot.rapport && <p>Rapport de la confirmation : {textes.rapport(lot.rapport)}.</p>}
        <ActionsLot
          lotId={lot.id}
          enAttente={lot.statut === "en_attente"}
          lignesRetenues={retenues.length}
          lignesEcartees={lot.ecartees.length}
          chemin={cheminDe(branchement)}
          textes={{ dansLEntite: textes.dansLEntite, ecriture: textes.ecriture, ecritsRestent: textes.ecritsRestent }}
          actions={actions}
        />
      </Carte>
      <Carte titre={`Lignes retenues (${retenues.length})`}>
        {textes.aideRetenues && <p>{textes.aideRetenues}</p>}
        <TableauRetenues colonnes={colonnesRetenues(branchement)} lignes={retenues} idTableau={idTableau} />
      </Carte>
      <Carte titre={`Lignes écartées (${lot.ecartees.length})`}>
        <TableauEcartees lignes={lot.ecartees} idTableau={idTableau} />
      </Carte>
      <Carte titre={`Fusions (${fusions.length})`}>
        <TableauFusions
          fusions={fusions}
          titreCle={titreDeLaCle(branchement)}
          aucuneFusion={textes.aucuneFusion}
          idTableau={idTableau}
        />
      </Carte>
    </>
  );
}
