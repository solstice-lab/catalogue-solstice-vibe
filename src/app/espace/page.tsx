import { redirect } from "next/navigation";
import { AppLayout } from "@/ui";
import { exiger } from "@/briques/comptes/roles";
import { monEspace } from "@/briques/espaces/acces";
import { lienPourRejoindre } from "@/briques/espaces/code";
import { EcranMonEspace } from "@/briques/espaces/EcranMonEspace";
import { lireMembres, lireMesEspaces } from "@/briques/espaces/espaces";
import { majuscule } from "@/briques/espaces/reglages";
import { ESPACES } from "@/config/espaces";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { urlPublique } from "@/lib/referencement";
import {
  choisirAction,
  inviterAction,
  nommerAction,
  quitterAction,
  regenererAction,
  retirerAction,
  retirerGestionnaireAction,
} from "./actions";

// Les membres se lisent à chaque requête : le build n'interroge jamais la base.
export const dynamic = "force-dynamic";

// « Mon espace » (brique espaces). Une personne sans espace part vers « Créer
// ou rejoindre ».
export default async function PageMonEspace() {
  const personne = await exiger("espaces.participer");
  const courant = await monEspace();
  if (!courant) redirect("/espace/rejoindre");
  const [membres, mesEspaces] = await Promise.all([
    lireMembres(courant.espace.id),
    ESPACES.plusieursParCompte ? lireMesEspaces(personne) : Promise.resolve([]),
  ]);
  const site = urlPublique();

  return (
    <AppLayout nom={NOM_APP} sousTitre={majuscule(ESPACES.vocabulaire.mon)} navigation={NAVIGATION}>
      <EcranMonEspace
        espace={courant.espace}
        adhesion={courant.adhesion}
        membres={membres}
        autresEspaces={mesEspaces.filter((espace) => espace.id !== courant.espace.id)}
        lienDInvitation={site ? lienPourRejoindre(site, courant.espace.code) : null}
        actions={{
          quitter: quitterAction,
          retirer: retirerAction,
          nommer: nommerAction,
          retirerGestionnaire: retirerGestionnaireAction,
          regenerer: regenererAction,
          inviter: inviterAction,
          choisir: choisirAction,
        }}
      />
    </AppLayout>
  );
}
