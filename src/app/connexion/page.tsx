import { AppLayout } from "@/ui";
import { EcranConnexion } from "@/briques/comptes/EcranConnexion";
import { cheminDeRetour } from "@/briques/comptes/retour";
import { NOM_APP } from "@/lib/navigation";

// Ouverte sans session (src/briques/comptes/protection.ts) : sans menu,
// puisque personne n'est encore connecté pour en ouvrir les entrées.
export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string | string[]; erreur?: string | string[] }>;
}) {
  const { retour, erreur } = await searchParams;
  return (
    <AppLayout nom={NOM_APP} sousTitre="Connexion" navigation={[]}>
      <EcranConnexion
        retour={cheminDeRetour(typeof retour === "string" ? retour : undefined)}
        erreur={typeof erreur === "string" ? erreur : undefined}
      />
    </AppLayout>
  );
}
