import { AppLayout } from "@/ui";
import { EcranLien } from "@/briques/comptes/EcranLien";
import { cheminDeRetour } from "@/briques/comptes/retour";
import { NOM_APP } from "@/lib/navigation";

// Où mène le lien de connexion envoyé par e-mail. Une page et jamais une
// route GET : son ouverture ne connecte pas (src/briques/comptes/lien-email.ts).
// Ouverte sans session, comme tout /connexion.
export default async function PageLienDeConnexion({
  searchParams,
}: {
  searchParams: Promise<{ jeton?: string | string[]; retour?: string | string[]; erreur?: string | string[] }>;
}) {
  const { jeton, retour, erreur } = await searchParams;
  return (
    <AppLayout nom={NOM_APP} sousTitre="Connexion" navigation={[]}>
      <EcranLien
        jeton={typeof jeton === "string" ? jeton : undefined}
        retour={cheminDeRetour(typeof retour === "string" ? retour : undefined)}
        erreur={typeof erreur === "string" ? erreur : undefined}
      />
    </AppLayout>
  );
}
