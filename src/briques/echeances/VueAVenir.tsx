"use client";

import { useRouter } from "next/navigation";
import { Badge, EtatVide, ListeCartes, Tableau, type ChampCarte, type Colonne } from "@/ui";
import { date } from "@/lib/format";
import type { PresentationEcheances } from "./branchement";
import { libelleJours, libelleStatut, type Echeance, type StatutVisible } from "./calcul";

// Le Tableau trie et filtre sur la valeur brute : il reçoit le statut en
// libellé d'écran, la date en « aaaa-mm-jj » (ordre du calendrier) et l'écart
// en nombre de jours (ordre numérique), montrés formatés ; leur filtre
// cherche dans le texte affiché.
type LigneEcheance = Echeance & { statut_libelle: string };

// Échue : la date est passée, c'est le signal négatif. En alerte : neutre,
// toute la vue est déjà une alerte, et un badge d'accent par ligne aurait
// dépassé les une à deux touches d'accent par écran (CLAUDE.md, Thème).
const TON_STATUT: Record<StatutVisible, "negatif" | "neutre"> = {
  echu_recemment: "negatif",
  en_alerte: "neutre",
};

function BadgeStatut({ echeance, retardSansLimite }: { echeance: Echeance; retardSansLimite?: boolean }) {
  return <Badge ton={TON_STATUT[echeance.statut]}>{libelleStatut(echeance.statut, retardSansLimite)}</Badge>;
}

/*
 * La vue « À venir » : en tableau sur ordinateur, en cartes sur téléphone
 * (décidé au cadrage de l'appli contrats). Chaque échéance mène à sa fiche.
 */
export function VueAVenir({ presentation, echeances }: { presentation: PresentationEcheances; echeances: Echeance[] }) {
  const router = useRouter();
  const { intitules, delaiAlerteJours: delai, retardSansLimite } = presentation;

  if (echeances.length === 0) {
    return (
      <EtatVide
        titre="Rien n'arrive à échéance"
        description={
          retardSansLimite
            ? `Aucune échéance dans les ${delai} prochains jours, et aucune en retard.`
            : `Aucune échéance dans les ${delai} prochains jours, ni passée depuis moins de ${delai} jours.`
        }
      />
    );
  }

  const lignes: LigneEcheance[] = echeances.map((echeance) => ({
    ...echeance,
    statut_libelle: libelleStatut(echeance.statut, retardSansLimite),
  }));

  const colonnes: Colonne<LigneEcheance>[] = [
    {
      cle: "statut_libelle",
      titre: "Statut",
      largeur: "150px",
      rendu: (e) => <BadgeStatut echeance={e} retardSansLimite={retardSansLimite} />,
    },
    { cle: "libelle", titre: intitules.entite },
    ...(intitules.detail ? [{ cle: "detail" as const, titre: intitules.detail }] : []),
    { cle: "date", titre: intitules.date, chiffres: true, rendu: (e) => date(e.date), filtre: (e) => date(e.date) },
    // Triée sur le nombre de jours, filtrée sur ce que l'écran montre : taper
    // « demain » doit trouver la ligne affichée « Demain ».
    {
      cle: "joursRestants",
      titre: "Échéance",
      rendu: (e) => libelleJours(e.joursRestants),
      filtre: (e) => libelleJours(e.joursRestants),
    },
  ];

  const champs: ChampCarte<Echeance>[] = [
    ...(intitules.detail ? [{ libelle: intitules.detail, valeur: (e: Echeance) => e.detail }] : []),
    { libelle: intitules.date, valeur: (e) => date(e.date), chiffres: true },
    { libelle: "Échéance", valeur: (e) => libelleJours(e.joursRestants) },
  ];

  return (
    <>
      <div className="sl-seulement-ordinateur">
        <Tableau
          id={presentation.id}
          colonnes={colonnes}
          lignes={lignes}
          cleLigne={(e) => e.lien}
          messageVide="Aucune échéance ne correspond aux filtres."
          auClicLigne={(e) => router.push(e.lien)}
        />
      </div>
      <div className="sl-seulement-telephone">
        <ListeCartes
          elements={echeances}
          cle={(e) => e.lien}
          titre={(e) => e.libelle}
          badge={(e) => <BadgeStatut echeance={e} retardSansLimite={retardSansLimite} />}
          champs={champs}
          lien={(e) => e.lien}
        />
      </div>
    </>
  );
}
