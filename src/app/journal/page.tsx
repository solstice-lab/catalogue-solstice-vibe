import { AppLayout, Carte, EtatVide } from "@/ui";
import { exiger } from "@/briques/comptes/roles";
import { LIMITE_ECRAN, lireJournal } from "@/briques/journal/journal";
import { TableauJournal } from "@/briques/journal/TableauJournal";
import { nombre } from "@/lib/format";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";

// Le journal se lit à chaque requête, jamais au build (qui n'a pas de base).
export const dynamic = "force-dynamic";

/*
 * Le journal d'audit (brique journal) : qui a créé, modifié ou supprimé
 * quoi, et quand. Réservé à journal.consulter (src/config/acces.ts). Une
 * fiche supprimée n'a plus de page : c'est ici qu'on la retrouve. Rien ne
 * s'y efface.
 */
export default async function PageJournal() {
  await exiger("journal.consulter");
  const lignes = await lireJournal({ limite: LIMITE_ECRAN });

  return (
    <AppLayout nom={NOM_APP} sousTitre="Journal" navigation={NAVIGATION}>
      <Carte titre="Journal des modifications">
        {lignes.length === 0 ? (
          <EtatVide
            titre="Aucune trace"
            description="Chaque création, modification ou suppression faite dans l'appli s'inscrira ici."
          />
        ) : (
          <TableauJournal id="journal" lignes={lignes} avecEntite />
        )}
      </Carte>
      {lignes.length === LIMITE_ECRAN && (
        <div className="sl-note">
          Seules les {nombre(LIMITE_ECRAN)} dernières lignes sont affichées. L&apos;historique d&apos;une fiche se lit
          sur la fiche elle-même.
        </div>
      )}
    </AppLayout>
  );
}
