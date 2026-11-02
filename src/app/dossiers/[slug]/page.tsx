import { notFound } from "next/navigation";
import { AppLayout, Badge, Carte, LienBouton } from "@/ui";
import { lireDossierParIdentifiant } from "@/lib/db/dossiers";
import { LIBELLES_STATUT_DOSSIER } from "@/lib/dossiers-domaine";
import { date, montant } from "@/lib/format";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { exiger } from "@/briques/comptes/roles";
import { cheminDossier } from "@/lib/slug";
import { BoutonSupprimerDossier } from "./BoutonSupprimerDossier";
import { HistoriqueFiche } from "@/briques/journal/HistoriqueFiche";

// Voir dossiers/page.tsx : aucune page du module ne se prérend.
export const dynamic = "force-dynamic";

const TON_STATUT = { en_cours: "accent", gagne: "positif", perdu: "negatif" } as const;

/*
 * La FICHE est en LECTURE SEULE (règle maison, héritée d'un projet précédent) : elle
 * affiche exactement les champs du formulaire (parité), et ne porte que des
 * actions annexes — modifier (qui renvoie vers /modifier) et supprimer.
 * Toute mutation des champs passe par /nouveau ou /modifier.
 */
export default async function PageFicheDossier({ params }: { params: Promise<{ slug: string }> }) {
  await exiger("dossiers.acceder");
  const { slug } = await params;
  const dossier = await lireDossierParIdentifiant(slug);
  if (!dossier) notFound();

  return (
    <AppLayout nom={NOM_APP} sousTitre="Dossiers" navigation={NAVIGATION}>
      <Carte
        titre={`Dossier ${dossier.reference}`}
        actions={
          <>
            <LienBouton variante="secondaire" href={`${cheminDossier(dossier)}/modifier`}>
              Modifier
            </LienBouton>
            <BoutonSupprimerDossier id={dossier.id} reference={dossier.reference} />
          </>
        }
      >
        <dl className="sl-fiche">
          <dt>Référence</dt>
          <dd>{dossier.reference}</dd>
          <dt>Client</dt>
          <dd>{dossier.client}</dd>
          <dt>Montant</dt>
          <dd className="sl-chiffres">
            {montant(dossier.montant_centimes / 100, dossier.montant_centimes % 100 === 0 ? 0 : 2)}
          </dd>
          <dt>Statut</dt>
          <dd>
            <Badge ton={TON_STATUT[dossier.statut]}>{LIBELLES_STATUT_DOSSIER[dossier.statut]}</Badge>
          </dd>
          <dt>Échéance</dt>
          <dd>{dossier.echeance ? date(dossier.echeance) : "—"}</dd>
          <dt>Notes</dt>
          <dd style={{ whiteSpace: "pre-wrap" }}>{dossier.notes ?? "—"}</dd>
        </dl>
      </Carte>
      <HistoriqueFiche entite="dossiers" entiteId={dossier.id} />
    </AppLayout>
  );
}
