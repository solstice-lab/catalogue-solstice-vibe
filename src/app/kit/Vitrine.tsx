"use client";

// Vitrine du kit UI, rendue sur /kit (hors navigation) : elle montre chaque
// composant en situation et sert de vérification visuelle après une
// thématisation. Données toutes fictives : elle occupait l'accueil, où la
// seule tuile réelle (échéances) se perdait parmi elles.

import { useState } from "react";
import {
  AppLayout,
  Badge,
  Bouton,
  Carte,
  Champ,
  ChampCase,
  ChampSelect,
  ChampTexteLong,
  EtatVide,
  GrilleMois,
  LienBouton,
  Modale,
  NavigationMois,
  Tableau,
  TuileKPI,
  type CelluleMois,
  type Colonne,
  type LienNavigation,
} from "@/ui";
import { jourSemaineCourt, montant, moisAnnee, pourcentage } from "@/lib/format";

type Dossier = {
  reference: string;
  client: string;
  montant: number;
  statut: "En cours" | "Gagné" | "Perdu";
  echeance: string;
};

const dossiersFictifs: Dossier[] = [
  { reference: "DOS-014", client: "Atelier Morvan", montant: 12500, statut: "En cours", echeance: "2026-10-02" },
  { reference: "DOS-015", client: "Groupe Helios", montant: 48000, statut: "Gagné", echeance: "2026-09-18" },
  { reference: "DOS-016", client: "Fonderie Blain", montant: 7300, statut: "Perdu", echeance: "2026-08-30" },
  { reference: "DOS-017", client: "Maison Vasseur", montant: 21900, statut: "En cours", echeance: "2026-11-12" },
  { reference: "DOS-018", client: "Coopérative Ardent", montant: 3400, statut: "Gagné", echeance: "2026-09-25" },
];

const tonStatut = { "En cours": "accent", Gagné: "positif", Perdu: "negatif" } as const;

const colonnes: Colonne<Dossier>[] = [
  { cle: "reference", titre: "Référence", largeur: "120px" },
  { cle: "client", titre: "Client" },
  { cle: "montant", titre: "Montant", chiffres: true, rendu: (d) => montant(d.montant) },
  { cle: "statut", titre: "Statut", rendu: (d) => <Badge ton={tonStatut[d.statut]}>{d.statut}</Badge> },
  { cle: "echeance", titre: "Échéance", chiffres: true },
];

type Poste = { libelle: string; valeur: number; enfants?: Poste[] };

const postesFictifs: Poste[] = [
  {
    libelle: "Produits",
    valeur: 93100,
    enfants: [
      { libelle: "Prestations", valeur: 78400 },
      { libelle: "Licences", valeur: 14700 },
    ],
  },
  {
    libelle: "Charges",
    valeur: -41200,
    enfants: [
      {
        libelle: "Salaires",
        valeur: -32600,
        enfants: [
          { libelle: "Équipe projet", valeur: -27600 },
          { libelle: "Support", valeur: -5000 },
        ],
      },
      { libelle: "Logiciels", valeur: -8600 },
    ],
  },
];

const colonnesPostes: Colonne<Poste>[] = [
  { cle: "libelle", titre: "Poste" },
  { cle: "valeur", titre: "Montant", chiffres: true, largeur: "160px", rendu: (p) => montant(p.valeur) },
];

// Un mois fictif et figé : la vitrine ne dépend pas du jour où on la regarde.
// Les cinq semaines d'octobre 2026 (du lundi 28 septembre au dimanche 1er
// novembre) sont écrites ici plutôt que construites par la brique calendrier :
// le kit ne dépend d'aucune brique, qui peut être retirée d'une copie client.
const MOIS_FICTIF = "2026-10";
const elementsFictifs = [
  { date: "2026-10-02", libelle: "Dossier A — relance", lien: "#a" },
  { date: "2026-10-14", libelle: "Dossier B — signature", lien: "#b" },
  { date: "2026-10-14", libelle: "Dossier C — revue", lien: "#c" },
  { date: "2026-10-27", libelle: "Dossier D — livraison", lien: "#d" },
];
const semainesFictives: CelluleMois<(typeof elementsFictifs)[number]>[][] = Array.from({ length: 5 }, (_, semaine) =>
  Array.from({ length: 7 }, (_, jour) => {
    const date = new Date(Date.UTC(2026, 8, 28 + semaine * 7 + jour)).toISOString().slice(0, 10);
    const dansLeMois = date.startsWith(MOIS_FICTIF);
    return {
      date,
      dansLeMois,
      aujourdhui: date === "2026-10-14",
      elements: dansLeMois ? elementsFictifs.filter((element) => element.date === date) : [],
    };
  })
);

// Le nom et le menu viennent de la page (serveur) : avec la brique comptes,
// lib/navigation.ts dépend de ses droits (next/headers), qu'un composant client
// ne peut pas importer.
export function Vitrine({ nom, navigation }: { nom: string; navigation: LienNavigation[] }) {
  const [modaleOuverte, setModaleOuverte] = useState(false);

  return (
    <AppLayout nom={nom} sousTitre="Vitrine du kit UI" badge="Template · Solstice Lab" navigation={navigation}>
      <div className="sl-grille sl-grille--serree">
        <TuileKPI
          libelle="Pipeline"
          valeur={montant(93100)}
          variation={{ texte: "+12 % sur un mois", ton: "positif" }}
        />
        <TuileKPI libelle="Dossiers en cours" valeur="2" aide="sur 5 au total" />
        <TuileKPI libelle="Taux de gain" valeur={pourcentage(0.4, 0)} variation={{ texte: "−5 pts", ton: "negatif" }} />
      </div>

      <Carte titre="Tableau — tri, filtres, actions en lot et exports intégrés">
        <Tableau
          id="dossiers"
          colonnes={colonnes}
          lignes={dossiersFictifs}
          cleLigne={(d) => d.reference}
          messageVide="Aucun dossier ne correspond aux filtres."
          exports={{ nomFichier: "dossiers", titre: "Dossiers en cours" }}
          actionsLot={(selection, viderSelection) => (
            <Bouton variante="secondaire" onClick={viderSelection}>
              Archiver ({selection.length})
            </Bouton>
          )}
        />
      </Carte>

      <Carte titre="Tableau hiérarchique — déplis conservés, pas de tri, le filtre masque">
        <Tableau
          id="postes"
          colonnes={colonnesPostes}
          lignes={postesFictifs}
          cleLigne={(p) => p.libelle}
          enfants={(p) => p.enfants}
          messageVide="Aucun poste ne correspond au filtre."
        />
      </Carte>

      <Carte titre="Calendrier mensuel — une grille par mois, chaque élément mène à sa fiche">
        <NavigationMois
          titre={moisAnnee(MOIS_FICTIF)}
          hrefPrecedent="#precedent"
          hrefSuivant="#suivant"
          hrefAujourdhui="#aujourdhui"
        />
        <GrilleMois
          titre={`Dossiers : ${moisAnnee(MOIS_FICTIF)}`}
          entetes={semainesFictives[0].map((cellule) => jourSemaineCourt(cellule.date))}
          semaines={semainesFictives}
          cle={(e) => e.lien}
          libelle={(e) => e.libelle}
          lien={(e) => e.lien}
        />
      </Carte>

      <div className="sl-grille">
        <Carte titre="Boutons et badges">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <Bouton onClick={() => setModaleOuverte(true)}>Ouvrir la modale</Bouton>
            <Bouton variante="secondaire">Secondaire</Bouton>
            <Bouton variante="danger">Danger</Bouton>
            <Bouton disabled>Désactivé</Bouton>
            <LienBouton variante="secondaire" href="/kit">
              Lien à l&apos;allure de bouton
            </LienBouton>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <Badge>Neutre</Badge>
            <Badge ton="accent">Accent</Badge>
            <Badge ton="positif">+12 %</Badge>
            <Badge ton="negatif">−4 %</Badge>
          </div>
        </Carte>

        <Carte titre="Formulaire">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Champ
              label="Nom du dossier"
              placeholder="Ex. Refonte du portail"
              aide="Visible dans la liste des dossiers."
            />
            <ChampSelect
              label="Statut"
              options={[
                { valeur: "en-cours", libelle: "En cours" },
                { valeur: "gagne", libelle: "Gagné" },
                { valeur: "perdu", libelle: "Perdu" },
              ]}
            />
            <ChampTexteLong label="Notes" placeholder="Contexte, décisions, prochaines étapes…" />
            <ChampCase
              label="Prévenir par e-mail"
              aide="Un mail d'information, sans lien de connexion."
              defaultChecked
            />
          </div>
        </Carte>

        <Carte
          titre="Site vitrine"
          actions={
            <LienBouton variante="secondaire" href="/kit/site-vitrine">
              Voir la page
            </LienBouton>
          }
        >
          <p>
            En-tête horizontal, sections, appel à l&apos;action et pied de page d&apos;un site public, sur une page à
            part : leur en-tête et leur pied ne s&apos;imbriquent pas dans celle-ci.
          </p>
        </Carte>

        <Carte titre="État vide">
          <EtatVide
            titre="Aucun dossier pour l'instant"
            description="Les dossiers créés apparaîtront ici."
            action={<Bouton variante="secondaire">Créer un dossier</Bouton>}
          />
        </Carte>
      </div>

      <div className="sl-note">
        <b>Note.</b> Données fictives — cette page montre le kit UI et sert de vérification visuelle après
        thématisation. Elle n&apos;apparaît pas dans la navigation.
      </div>

      <Modale
        ouverte={modaleOuverte}
        titre="Exemple de modale"
        onFermer={() => setModaleOuverte(false)}
        piedDePage={
          <>
            <Bouton variante="secondaire" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Bouton>
            <Bouton onClick={() => setModaleOuverte(false)}>Confirmer</Bouton>
          </>
        }
      >
        <p>Fermeture par la touche Échap, le voile ou la croix. Le liseré d&apos;accent en haut vient du thème.</p>
      </Modale>
    </AppLayout>
  );
}
