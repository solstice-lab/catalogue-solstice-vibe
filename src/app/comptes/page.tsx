import { AppLayout } from "@/ui";
import { listerComptes, listerDomaines } from "@/briques/comptes/administration";
import { exiger } from "@/briques/comptes/roles";
import { EcranComptes } from "@/briques/gestion-comptes/EcranComptes";
import { ROLE_ADMIN, ROLE_PAR_DEFAUT, ROLES } from "@/config/acces";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import {
  changerRoleAction,
  desactiverAction,
  fermerDomaineAction,
  inviterAction,
  ouvrirDomaineAction,
  reactiverAction,
} from "./actions";

// La liste se lit à chaque requête : le build n'interroge jamais la base.
export const dynamic = "force-dynamic";

// L'administration des comptes. Sans le droit, un 404 : ne pas
// confirmer à un curieux que la page existe.
export default async function PageComptes() {
  const { email } = await exiger("comptes.administrer");
  // L'adresse ne sert qu'à marquer « Vous » et à prévenir avant un geste sur
  // soi-même : elle ne protège rien.
  const [comptes, domaines] = await Promise.all([listerComptes(), listerDomaines()]);

  return (
    <AppLayout nom={NOM_APP} sousTitre="Comptes" navigation={NAVIGATION}>
      <EcranComptes
        comptes={comptes}
        domaines={domaines}
        roles={ROLES}
        roleParDefaut={ROLE_PAR_DEFAUT}
        roleAdmin={ROLE_ADMIN}
        emailConnecte={email}
        actions={{
          inviter: inviterAction,
          changerRole: changerRoleAction,
          desactiver: desactiverAction,
          reactiver: reactiverAction,
          ouvrirDomaine: ouvrirDomaineAction,
          fermerDomaine: fermerDomaineAction,
        }}
      />
    </AppLayout>
  );
}
