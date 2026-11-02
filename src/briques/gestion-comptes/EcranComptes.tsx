"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Badge, Bouton, Carte, Champ, ChampCase, ChampSelect, EtatVide, Modale, Tableau, type Colonne } from "@/ui";
import { date } from "@/lib/format";
import type { CompteAdministre, DomaineAdministre, StatutDuCompte } from "@/briques/comptes/administration";
import type { OrigineDuCompte } from "@/briques/comptes/entree";
import type { RetourAdministration } from "./domaine";

/*
 * L'écran /comptes : les comptes, puis les domaines ouverts.
 * Chaque geste passe par une Modale, qui dit ses effets avant et affiche le
 * refus du serveur s'il y en a un. Le dernier admin actif n'a aucune action
 * (première porte) ; le serveur refuse de toute façon (seconde porte,
 * briques/comptes/administration.ts).
 */

export type ActionsAdministration = {
  inviter: (email: string, role: string, prevenir: boolean) => Promise<RetourAdministration>;
  changerRole: (id: number, role: string) => Promise<RetourAdministration>;
  desactiver: (id: number) => Promise<RetourAdministration>;
  reactiver: (id: number) => Promise<RetourAdministration>;
  ouvrirDomaine: (domaine: string) => Promise<RetourAdministration>;
  fermerDomaine: (domaine: string) => Promise<RetourAdministration>;
};

type Geste =
  | { type: "inviter" }
  | { type: "role"; compte: LigneCompte }
  | { type: "desactiver"; compte: LigneCompte }
  | { type: "ouvrir" }
  | { type: "fermer"; domaine: DomaineAdministre };

// Les dates en chaîne ISO : le tri du Tableau compare des chaînes.
type LigneCompte = Omit<CompteAdministre, "derniereConnexion" | "creeLe"> & {
  derniereConnexion: string;
  creeLe: string;
  // Le numéro du compte, tel que le journal d'audit le désigne (« compte
  // n°12 ») : il ne recopie jamais l'adresse. La clé « id » est déjà prise
  // par la colonne des actions.
  numero: number;
};

const ORIGINES: Record<OrigineDuCompte, string> = {
  appli: "Appli",
  configuration: "Configuration",
  demo: "Démo",
  domaine: "Domaine",
  "premier-admin": "Premier admin",
  aucune: "Aucune",
};

// Ce qu'un compte suit avant d'être repris par l'appli (modale du rôle).
const SUIT: Record<Exclude<OrigineDuCompte, "appli">, string> = {
  configuration: "la configuration",
  demo: "la démo",
  domaine: "son domaine",
  "premier-admin": "la variable du premier admin",
  aucune: "plus rien qui l'admette",
};

const STATUTS: Record<StatutDuCompte, { libelle: string; ton: "positif" | "negatif" | "neutre" }> = {
  actif: { libelle: "Actif", ton: "positif" },
  desactive: { libelle: "Désactivé", ton: "neutre" },
  "sans-acces": { libelle: "Sans accès", ton: "negatif" },
};

const FORMULAIRE = "formulaire-comptes";

export function EcranComptes({
  comptes,
  domaines,
  roles,
  roleParDefaut,
  roleAdmin,
  emailConnecte,
  actions,
}: {
  comptes: CompteAdministre[];
  domaines: DomaineAdministre[];
  roles: readonly string[];
  roleParDefaut: string;
  roleAdmin: string;
  emailConnecte: string;
  actions: ActionsAdministration;
}) {
  const [geste, setGeste] = useState<Geste | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<{ titre: string; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const ouvrir = (suivant: Geste) => {
    setErreur(null);
    setGeste(suivant);
  };
  const fermer = () => setGeste(null);

  // Un refus reste dans la Modale du geste ; un geste fait la ferme, et son
  // message, s'il en a un, se dit ensuite. Un geste lancé d'un bouton de ligne
  // (Réactiver, Rouvrir) n'a pas de Modale : son refus se dit dans l'annonce,
  // sinon il ne s'affichait nulle part.
  const lancer = (operation: () => Promise<RetourAdministration>, dansUneModale = true) =>
    demarrer(async () => {
      const retour = await operation();
      if (retour.erreur) {
        if (dansUneModale) setErreur(retour.erreur);
        else setAnnonce({ titre: "Geste refusé", texte: retour.erreur });
        return;
      }
      setGeste(null);
      if (retour.message) setAnnonce({ titre: "Invitation", texte: retour.message });
    });

  const soumettre = (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!geste) return;
    const donnees = new FormData(evenement.currentTarget);
    const texte = (nom: string) => String(donnees.get(nom) ?? "");
    if (geste.type === "inviter")
      lancer(() => actions.inviter(texte("email"), texte("role"), donnees.get("prevenir") === "on"));
    else if (geste.type === "role") lancer(() => actions.changerRole(geste.compte.id, texte("role")));
    else if (geste.type === "ouvrir") lancer(() => actions.ouvrirDomaine(texte("domaine")));
  };

  const lignes: LigneCompte[] = comptes.map((compte) => ({
    ...compte,
    derniereConnexion: compte.derniereConnexion ? new Date(compte.derniereConnexion).toISOString() : "",
    creeLe: new Date(compte.creeLe).toISOString(),
    numero: compte.id,
  }));
  const options = roles.map((role) => ({ valeur: role, libelle: role }));
  const vous = (compte: LigneCompte) => compte.email === emailConnecte;

  const colonnes: Colonne<LigneCompte>[] = [
    { cle: "numero", titre: "N°", chiffres: true },
    {
      cle: "email",
      titre: "Adresse",
      rendu: (compte) =>
        vous(compte) ? (
          <>
            {compte.email} <Badge>Vous</Badge>
          </>
        ) : (
          compte.email
        ),
    },
    { cle: "role", titre: "Rôle" },
    {
      cle: "statut",
      titre: "Statut",
      rendu: (compte) => <Badge ton={STATUTS[compte.statut].ton}>{STATUTS[compte.statut].libelle}</Badge>,
      filtre: (compte) => STATUTS[compte.statut].libelle,
    },
    {
      cle: "origine",
      titre: "Géré par",
      rendu: (compte) => ORIGINES[compte.origine],
      filtre: (compte) => ORIGINES[compte.origine],
    },
    {
      cle: "derniereConnexion",
      titre: "Dernière connexion",
      rendu: (compte) => (compte.derniereConnexion ? date(compte.derniereConnexion) : "Jamais"),
      filtre: (compte) => (compte.derniereConnexion ? date(compte.derniereConnexion) : "Jamais"),
    },
    {
      cle: "creeLe",
      titre: "Créé le",
      rendu: (compte) => date(compte.creeLe),
      filtre: (compte) => date(compte.creeLe),
    },
    {
      cle: "id",
      titre: "Actions",
      figee: "droite",
      filtre: () => "",
      rendu: (compte) => {
        if (compte.origine === "demo") return "Compte de démo";
        if (compte.protege) return "Dernier admin actif";
        if (compte.statut === "desactive") {
          return (
            <Bouton
              variante="secondaire"
              disabled={enCours}
              onClick={() => lancer(() => actions.reactiver(compte.id), false)}
            >
              Réactiver
            </Bouton>
          );
        }
        return (
          <div className="sl-rangee-actions">
            <Bouton variante="secondaire" disabled={enCours} onClick={() => ouvrir({ type: "role", compte })}>
              Changer le rôle
            </Bouton>
            <Bouton variante="danger" disabled={enCours} onClick={() => ouvrir({ type: "desactiver", compte })}>
              Désactiver
            </Bouton>
          </div>
        );
      },
    },
  ];

  const colonnesDomaines: Colonne<DomaineAdministre>[] = [
    { cle: "domaine", titre: "Domaine" },
    {
      cle: "origine",
      titre: "Ouvert par",
      rendu: (domaine) => ORIGINES[domaine.origine],
      filtre: (domaine) => ORIGINES[domaine.origine],
    },
    {
      cle: "ouvert",
      titre: "Statut",
      rendu: (domaine) => (
        <Badge ton={domaine.ouvert ? "positif" : "neutre"}>{domaine.ouvert ? "Ouvert" : "Fermé"}</Badge>
      ),
      filtre: (domaine) => (domaine.ouvert ? "Ouvert" : "Fermé"),
    },
    { cle: "comptesActifs", titre: "Comptes actifs", chiffres: true },
    {
      cle: "comptesQuiPerdraientLAcces",
      titre: "Actions",
      figee: "droite",
      filtre: () => "",
      rendu: (domaine) => {
        if (domaine.origine === "configuration") return "Dans la configuration";
        if (!domaine.ouvert) {
          return (
            <Bouton
              variante="secondaire"
              disabled={enCours}
              onClick={() => lancer(() => actions.ouvrirDomaine(domaine.domaine), false)}
            >
              Rouvrir
            </Bouton>
          );
        }
        return (
          <Bouton variante="danger" disabled={enCours} onClick={() => ouvrir({ type: "fermer", domaine })}>
            Fermer
          </Bouton>
        );
      },
    },
  ];

  return (
    <>
      <Carte
        titre="Comptes"
        actions={
          <Bouton disabled={enCours} onClick={() => ouvrir({ type: "inviter" })}>
            Inviter
          </Bouton>
        }
      >
        <Tableau
          id="comptes"
          colonnes={colonnes}
          lignes={lignes}
          cleLigne={(compte) => String(compte.id)}
          messageVide="Aucun compte ne correspond aux filtres."
        />
      </Carte>

      <Carte
        titre="Domaines"
        actions={
          <Bouton variante="secondaire" disabled={enCours} onClick={() => ouvrir({ type: "ouvrir" })}>
            Ouvrir un domaine
          </Bouton>
        }
      >
        {domaines.length === 0 ? (
          <EtatVide
            titre="Aucun domaine ouvert"
            description={`Ouvrir un domaine fait entrer toute adresse de ce domaine, avec le rôle ${roleParDefaut}.`}
          />
        ) : (
          <Tableau
            id="comptes-domaines"
            colonnes={colonnesDomaines}
            lignes={domaines}
            cleLigne={(domaine) => domaine.domaine}
          />
        )}
      </Carte>

      <Modale
        ouverte={geste !== null}
        titre={titreDe(geste)}
        onFermer={fermer}
        piedDePage={
          <>
            <Bouton variante="secondaire" onClick={fermer}>
              Annuler
            </Bouton>
            {geste?.type === "desactiver" && (
              <Bouton
                variante="danger"
                disabled={enCours}
                onClick={() => lancer(() => actions.desactiver(geste.compte.id))}
              >
                Désactiver
              </Bouton>
            )}
            {geste?.type === "fermer" && (
              <Bouton
                variante="danger"
                disabled={enCours}
                onClick={() => lancer(() => actions.fermerDomaine(geste.domaine.domaine))}
              >
                Fermer le domaine
              </Bouton>
            )}
            {(geste?.type === "inviter" || geste?.type === "role" || geste?.type === "ouvrir") && (
              <Bouton type="submit" form={FORMULAIRE} disabled={enCours}>
                {geste.type === "inviter" ? "Inviter" : geste.type === "role" ? "Enregistrer" : "Ouvrir le domaine"}
              </Bouton>
            )}
          </>
        }
      >
        {geste?.type === "inviter" && (
          <form id={FORMULAIRE} className="sl-formulaire" onSubmit={soumettre}>
            <Champ label="Adresse e-mail" name="email" type="email" required autoFocus />
            <ChampSelect label="Rôle" name="role" options={options} defaultValue={roleParDefaut} />
            <ChampCase
              label="Prévenir par e-mail"
              name="prevenir"
              defaultChecked
              aide="Un mail d'information, avec l'adresse de la page de connexion, mais ni code ni lien qui connecte : la personne se connecte elle-même avec cette adresse."
            />
          </form>
        )}
        {geste?.type === "role" && (
          <form id={FORMULAIRE} className="sl-formulaire" onSubmit={soumettre}>
            <ChampSelect
              label={`Rôle de ${geste.compte.email}`}
              name="role"
              options={options}
              defaultValue={geste.compte.role}
            />
            {geste.compte.origine !== "appli" && (
              <p className="sl-note">
                Ce compte suit aujourd&apos;hui {SUIT[geste.compte.origine]}. Si vous enregistrez, même sans changer de
                rôle, l&apos;appli le gère désormais : {SUIT[geste.compte.origine]} ne s&apos;applique plus à lui, et
                seule sa désactivation ici le fera sortir.
              </p>
            )}
            {vous(geste.compte) && (
              <p className="sl-note">
                C&apos;est votre compte : sans le rôle {roleAdmin}, vous perdrez l&apos;accès à cette page.
              </p>
            )}
          </form>
        )}
        {geste?.type === "desactiver" && (
          <>
            <p>
              La personne perd l&apos;accès à la requête suivante, et ses sessions sont fermées. Le compte reste en base
              : vous pourrez le réactiver.
            </p>
            {vous(geste.compte) && (
              <p className="sl-note">C&apos;est votre compte : vous perdrez l&apos;accès à l&apos;appli.</p>
            )}
          </>
        )}
        {geste?.type === "ouvrir" && (
          <form id={FORMULAIRE} className="sl-formulaire" onSubmit={soumettre}>
            <Champ
              label="Domaine"
              name="domaine"
              placeholder="client.fr"
              required
              autoFocus
              aide={`Toute adresse @domaine pourra entrer, avec le rôle ${roleParDefaut}. Les sous-domaines ne sont pas compris, ni les messageries publiques.`}
            />
          </form>
        )}
        {geste?.type === "fermer" && (
          <p>
            Plus personne n&apos;entrera par ce domaine.{" "}
            {geste.domaine.comptesQuiPerdraientLAcces === 0
              ? "Aucun compte actif ne perd l'accès."
              : `${geste.domaine.comptesQuiPerdraientLAcces} compte${geste.domaine.comptesQuiPerdraientLAcces > 1 ? "s" : ""} de ce domaine perdr${geste.domaine.comptesQuiPerdraientLAcces > 1 ? "ont" : "a"} l'accès ; ceux dont vous avez fixé le rôle ici le gardent.`}
          </p>
        )}
        {erreur && <p className="sl-erreur-formulaire">{erreur}</p>}
      </Modale>

      <Modale
        ouverte={annonce !== null}
        titre={annonce?.titre ?? ""}
        onFermer={() => setAnnonce(null)}
        piedDePage={<Bouton onClick={() => setAnnonce(null)}>Fermer</Bouton>}
      >
        <p className={annonce?.titre === "Geste refusé" ? "sl-erreur-formulaire" : undefined}>{annonce?.texte}</p>
      </Modale>
    </>
  );
}

function titreDe(geste: Geste | null): string {
  switch (geste?.type) {
    case "inviter":
      return "Inviter une adresse";
    case "role":
      return "Changer le rôle";
    case "desactiver":
      return `Désactiver ${geste.compte.email} ?`;
    case "ouvrir":
      return "Ouvrir un domaine";
    case "fermer":
      return `Fermer le domaine ${geste.domaine.domaine} ?`;
    default:
      return "";
  }
}
