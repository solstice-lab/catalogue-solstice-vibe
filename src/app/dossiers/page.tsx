import { AppLayout, Carte, LienBouton } from "@/ui";
import { listerDossiers } from "@/lib/db/dossiers";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { exiger } from "@/briques/comptes/roles";
import { ListeDossiers } from "./ListeDossiers";

// Jamais prérendue : la liste se lit en base à CHAQUE requête (et le build ne
// doit pas tenter d'interroger la base). Même réglage sur toutes les pages du
// module — indispensable aussi le jour où le garde s'appuiera sur une session.
export const dynamic = "force-dynamic";

export default async function PageDossiers() {
  await exiger("dossiers.acceder");
  const dossiers = await listerDossiers();

  return (
    <AppLayout nom={NOM_APP} sousTitre="Dossiers" navigation={NAVIGATION}>
      <Carte titre="Dossiers" actions={<LienBouton href="/dossiers/nouveau">Nouveau dossier</LienBouton>}>
        <ListeDossiers dossiers={dossiers} />
      </Carte>
      <div className="sl-note">
        <b>Module d&apos;exemple.</b> « Dossiers » montre le patron canonique d&apos;un module métier : liste avec
        actions en lot, fiche en lecture seule, création par /nouveau, modification par /modifier. Copier ce patron pour
        chaque module réel, puis remplacer celui-ci.
      </div>
    </AppLayout>
  );
}
