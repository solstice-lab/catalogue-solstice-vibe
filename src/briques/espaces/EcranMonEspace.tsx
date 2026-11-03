"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Badge, Bouton, Carte, Champ, LienBouton, Modale, Tableau, type Colonne } from "@/ui";
import { date } from "@/lib/format";
import { ESPACES } from "@/config/espaces";
import { afficherCode } from "./code";
import type { Adhesion, Espace, RetourEspace } from "./domaine";
import { majuscule } from "./reglages";

/*
 * « Mon espace » (/espace) : les membres, le code et le lien pour en faire
 * entrer d'autres, et les gestes. Chaque geste passe par une Modale, qui dit
 * ses effets avant et affiche le refus du serveur s'il y en a un.
 *
 * Le dernier gestionnaire n'a pas le geste qui lui retirerait son rôle
 * (première porte) ; le serveur le refuse de toute façon, sous verrou
 * (seconde porte, briques/espaces/espaces.ts). Le Tableau garde la colonne
 * des gestes à droite : au téléphone, elle reste atteignable.
 */

export type ActionsMonEspace = {
  quitter: () => Promise<RetourEspace>;
  retirer: (adhesionId: number) => Promise<RetourEspace>;
  nommer: (adhesionId: number) => Promise<RetourEspace>;
  retirerGestionnaire: (adhesionId: number) => Promise<RetourEspace>;
  regenerer: () => Promise<RetourEspace>;
  inviter: (adresse: string) => Promise<RetourEspace>;
  choisir: (espaceId: number) => Promise<RetourEspace>;
};

type Geste =
  | { type: "retirer"; membre: Adhesion }
  | { type: "nommer"; membre: Adhesion }
  | { type: "retirer-role"; membre: Adhesion }
  | { type: "regenerer" }
  | { type: "inviter" }
  | { type: "quitter" };

const FORMULAIRE = "formulaire-espace";

export function EcranMonEspace({
  espace,
  adhesion,
  membres,
  autresEspaces,
  lienDInvitation,
  actions,
}: {
  espace: Espace;
  adhesion: Adhesion;
  membres: Adhesion[];
  autresEspaces: Pick<Espace, "id" | "nom">[];
  /** null sans adresse publique de l'appli (en local, sur une recette). */
  lienDInvitation: string | null;
  actions: ActionsMonEspace;
}) {
  const [geste, setGeste] = useState<Geste | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const v = ESPACES.vocabulaire;
  const gestionnaire = adhesion.role === "gestionnaire";
  const gestionnaires = membres.filter((membre) => membre.role === "gestionnaire").length;
  const seulGestionnaireAvecDAutres = gestionnaire && gestionnaires === 1 && membres.length > 1;

  const ouvrir = (suivant: Geste) => {
    setErreur(null);
    setGeste(suivant);
  };
  const fermer = () => setGeste(null);

  // Un refus reste dans la Modale du geste ; un geste fait la ferme, et son
  // message, s'il en a un, se dit ensuite.
  const lancer = (operation: () => Promise<RetourEspace>) =>
    demarrer(async () => {
      const retour = await operation();
      if (retour.erreur) {
        setErreur(retour.erreur);
        return;
      }
      setGeste(null);
      if (retour.message) setAnnonce(retour.message);
    });

  const inviter = (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const adresse = String(new FormData(evenement.currentTarget).get("adresse") ?? "");
    lancer(() => actions.inviter(adresse));
  };

  const copier = async () => {
    if (!lienDInvitation) return;
    try {
      await navigator.clipboard.writeText(lienDInvitation);
      setAnnonce("Lien copié.");
    } catch {
      setAnnonce(`Copiez le lien à la main : ${lienDInvitation}`);
    }
  };

  const libelleDuRole = (membre: Adhesion) => (membre.role === "gestionnaire" ? v.gestionnaire : v.membre);

  const colonnes: Colonne<Adhesion>[] = [
    {
      cle: "prenom",
      titre: "Prénom",
      rendu: (membre) =>
        membre.id === adhesion.id ? (
          <>
            {membre.prenom} <Badge>Vous</Badge>
          </>
        ) : (
          membre.prenom
        ),
    },
    {
      cle: "role",
      titre: "Rôle",
      rendu: (membre) => (
        <Badge ton={membre.role === "gestionnaire" ? "accent" : "neutre"}>{libelleDuRole(membre)}</Badge>
      ),
      filtre: libelleDuRole,
    },
    {
      cle: "arriveeLe",
      titre: "Arrivée",
      rendu: (membre) => date(membre.arriveeLe),
      filtre: (membre) => date(membre.arriveeLe),
    },
  ];
  if (gestionnaire) {
    colonnes.push({
      cle: "id",
      titre: "Gestes",
      figee: "droite",
      filtre: () => "",
      rendu: (membre) => {
        const soi = membre.id === adhesion.id;
        const roleRetirable = membre.role === "gestionnaire" && gestionnaires > 1;
        if (soi && !roleRetirable) return "";
        return (
          <div className="sl-rangee-actions">
            {membre.role === "membre" && (
              <Bouton variante="secondaire" disabled={enCours} onClick={() => ouvrir({ type: "nommer", membre })}>
                Donner le rôle
              </Bouton>
            )}
            {roleRetirable && (
              <Bouton variante="secondaire" disabled={enCours} onClick={() => ouvrir({ type: "retirer-role", membre })}>
                Retirer le rôle
              </Bouton>
            )}
            {!soi && (
              <Bouton variante="danger" disabled={enCours} onClick={() => ouvrir({ type: "retirer", membre })}>
                Retirer
              </Bouton>
            )}
          </div>
        );
      },
    });
  }

  return (
    <>
      <Carte titre={espace.nom}>
        <Tableau
          id="espace-membres"
          colonnes={colonnes}
          lignes={membres}
          cleLigne={(membre) => String(membre.id)}
          messageVide="Aucun membre ne correspond aux filtres."
        />
      </Carte>

      <Carte
        titre="Faire entrer quelqu'un"
        actions={
          gestionnaire ? (
            <Bouton disabled={enCours} onClick={() => ouvrir({ type: "inviter" })}>
              Inviter par e-mail
            </Bouton>
          ) : undefined
        }
      >
        <p>Donnez ce code : la personne se connecte, puis le saisit dans « Rejoindre {v.un} ».</p>
        <p className="sl-chiffres">{afficherCode(espace.code)}</p>
        <div className="sl-rangee-actions">
          {lienDInvitation && (
            <Bouton variante="secondaire" onClick={copier}>
              Copier le lien
            </Bouton>
          )}
          {gestionnaire && (
            <Bouton variante="secondaire" disabled={enCours} onClick={() => ouvrir({ type: "regenerer" })}>
              Nouveau code
            </Bouton>
          )}
        </div>
        {!lienDInvitation && (
          <p className="sl-note">
            Le lien à partager apparaît une fois l&apos;adresse publique de l&apos;appli réglée.
          </p>
        )}
      </Carte>

      {autresEspaces.length > 0 && (
        <Carte titre="Vos autres groupes">
          <div className="sl-rangee-actions">
            {autresEspaces.map((autre) => (
              <Bouton
                key={autre.id}
                variante="secondaire"
                disabled={enCours}
                onClick={() => lancer(() => actions.choisir(autre.id))}
              >
                {autre.nom}
              </Bouton>
            ))}
            <LienBouton variante="secondaire" href="/espace/rejoindre">
              Créer ou rejoindre
            </LienBouton>
          </div>
        </Carte>
      )}

      <Carte titre={`Quitter ${v.le}`}>
        {seulGestionnaireAvecDAutres ? (
          <p className="sl-note">
            Vous êtes le dernier membre au rôle « {v.gestionnaire} » : donnez d&apos;abord ce rôle à quelqu&apos;un
            d&apos;autre.
          </p>
        ) : (
          <div className="sl-rangee-actions">
            <Bouton variante="danger" disabled={enCours} onClick={() => ouvrir({ type: "quitter" })}>
              Quitter {v.le}
            </Bouton>
          </div>
        )}
      </Carte>

      <Modale
        ouverte={geste !== null}
        titre={titreDe(geste, v.le, v.gestionnaire)}
        onFermer={fermer}
        piedDePage={
          <>
            <Bouton variante="secondaire" onClick={fermer}>
              Annuler
            </Bouton>
            {geste?.type === "inviter" && (
              <Bouton type="submit" form={FORMULAIRE} disabled={enCours}>
                Inviter
              </Bouton>
            )}
            {geste?.type === "nommer" && (
              <Bouton disabled={enCours} onClick={() => lancer(() => actions.nommer(geste.membre.id))}>
                Donner le rôle
              </Bouton>
            )}
            {geste?.type === "retirer-role" && (
              <Bouton disabled={enCours} onClick={() => lancer(() => actions.retirerGestionnaire(geste.membre.id))}>
                Retirer le rôle
              </Bouton>
            )}
            {geste?.type === "regenerer" && (
              <Bouton disabled={enCours} onClick={() => lancer(actions.regenerer)}>
                Créer un nouveau code
              </Bouton>
            )}
            {geste?.type === "retirer" && (
              <Bouton
                variante="danger"
                disabled={enCours}
                onClick={() => lancer(() => actions.retirer(geste.membre.id))}
              >
                Retirer
              </Bouton>
            )}
            {geste?.type === "quitter" && (
              <Bouton variante="danger" disabled={enCours} onClick={() => lancer(actions.quitter)}>
                Quitter
              </Bouton>
            )}
          </>
        }
      >
        {geste?.type === "inviter" && (
          <form id={FORMULAIRE} className="sl-formulaire" onSubmit={inviter}>
            <Champ
              label="Adresse e-mail"
              name="adresse"
              type="email"
              required
              autoFocus
              aide={`Un mail part à cette seule adresse, avec votre prénom, le nom ${v.du}, le code et le lien. La personne se connecte avec cette adresse, puis rejoint.`}
            />
          </form>
        )}
        {geste?.type === "nommer" && (
          <p>
            {geste.membre.prenom} pourra faire entrer et retirer des membres, et donner ou retirer ce rôle, vous
            compris.
          </p>
        )}
        {geste?.type === "retirer-role" && (
          <p>
            {geste.membre.id === adhesion.id
              ? "Vous ne pourrez plus faire entrer ni retirer de membres."
              : `${geste.membre.prenom} ne pourra plus faire entrer ni retirer de membres.`}
          </p>
        )}
        {geste?.type === "regenerer" && (
          <p>L&apos;ancien code et son lien cessent aussitôt de marcher. Les membres présents restent.</p>
        )}
        {geste?.type === "retirer" && (
          <p>
            {geste.membre.prenom} perd l&apos;accès à {v.le} à sa prochaine page. Avec le code actuel, la personne peut
            revenir : créez un nouveau code pour l&apos;en empêcher.
          </p>
        )}
        {geste?.type === "quitter" && (
          <p>
            Vous perdez l&apos;accès à {v.le}. Pour revenir, il vous faudra son code.
            {membres.length === 1 &&
              ` Vous êtes le seul membre : la prochaine personne qui rejoindra ${v.le} recevra le rôle « ${v.gestionnaire} ».`}
          </p>
        )}
        {erreur && <p className="sl-erreur-formulaire">{erreur}</p>}
      </Modale>

      <Modale ouverte={annonce !== null} titre={majuscule(v.mon)} onFermer={() => setAnnonce(null)}>
        <p>{annonce}</p>
      </Modale>
    </>
  );
}

function titreDe(geste: Geste | null, le: string, gestionnaire: string): string {
  if (!geste) return "";
  if (geste.type === "inviter") return "Inviter par e-mail";
  if (geste.type === "nommer") return `Donner le rôle « ${gestionnaire} » à ${geste.membre.prenom}`;
  if (geste.type === "retirer-role") return `Retirer le rôle « ${gestionnaire} »`;
  if (geste.type === "regenerer") return "Créer un nouveau code";
  if (geste.type === "retirer") return `Retirer ${geste.membre.prenom}`;
  return `Quitter ${le}`;
}
