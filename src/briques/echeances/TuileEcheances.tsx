import { TuileKPI } from "@/ui";
import type { PresentationEcheances } from "./branchement";

/*
 * Tuile d'accueil : le nombre d'échéances en alerte, qui mène à la vue
 * « À venir ». Les échues récentes s'y ajoutent en aide : elles sont dans la
 * vue, la tuile ne doit pas laisser croire qu'il n'y a rien à voir.
 * `compte` vient de compterEcheances() (requete.ts).
 *
 * `presentation` vient de presentationDe(branchement), comme pour la vue :
 * délai, retard sans limite (l'aide parle alors de retards, pas d'échues
 * récemment) et libellé (`intitules.tuile`, qui distingue deux branchements
 * sur l'accueil) ne se recopient pas à la main.
 */
export function TuileEcheances({
  compte: { enAlerte, echues },
  presentation: { delaiAlerteJours: delai, retardSansLimite, intitules },
  href,
}: {
  compte: { enAlerte: number; echues: number };
  presentation: PresentationEcheances;
  href: string;
}) {
  const motEchues = retardSansLimite ? "en retard" : "échues récemment";
  const aideSingulier = retardSansLimite ? "et 1 en retard" : "et 1 échue récemment";
  return (
    <TuileKPI
      libelle={intitules.tuile ?? `Échéances à ${delai} jours`}
      valeur={String(enAlerte)}
      aide={echues === 0 ? undefined : echues === 1 ? aideSingulier : `et ${echues} ${motEchues}`}
      href={href}
    />
  );
}
