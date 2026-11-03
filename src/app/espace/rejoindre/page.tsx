import { redirect } from "next/navigation";
import { AppLayout } from "@/ui";
import { exiger } from "@/briques/comptes/roles";
import { monEspace } from "@/briques/espaces/acces";
import { EcranCreerOuRejoindre } from "@/briques/espaces/EcranCreerOuRejoindre";
import { ESPACES } from "@/config/espaces";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { creerAction, rejoindreAction } from "../actions";

// Lit l'espace de la personne à chaque requête.
export const dynamic = "force-dynamic";

// « Créer ou rejoindre » (brique espaces). Le lien d'invitation y mène avec
// le code prérempli ; derrière la connexion, comme toute page, il y revient
// après elle. Avec un seul espace par compte, qui en a déjà un va au sien.
export default async function PageCreerOuRejoindre({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await exiger("espaces.participer");
  if (!ESPACES.plusieursParCompte && (await monEspace())) redirect("/espace");
  const { code } = await searchParams;

  return (
    <AppLayout nom={NOM_APP} sousTitre="Créer ou rejoindre" navigation={NAVIGATION}>
      <EcranCreerOuRejoindre
        codeInitial={typeof code === "string" ? code.slice(0, 20) : ""}
        actions={{ creer: creerAction, rejoindre: rejoindreAction }}
      />
    </AppLayout>
  );
}
