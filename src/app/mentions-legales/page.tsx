import Link from "next/link";
import { AppLayout, Badge, Carte } from "@/ui";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { CHAMPS_REQUIS, MENTIONS_LEGALES, champsManquants } from "@/lib/mentions-legales";
import { metadonneesDePage } from "@/lib/referencement";

export function generateMetadata() {
  return metadonneesDePage({ titre: "Mentions légales", chemin: "/mentions-legales" });
}

// Ouverte à tout visiteur, sans garde : la loi exige que ces mentions soient
// lisibles par quiconque visite le site. La page ne lit donc ni la base ni la
// session (tests/mentions-legales.test.ts le verrouille). Le menu ne garde que
// les entrées sans garde : filtrer les autres oblige à lire la session, ce
// qu'un visiteur anonyme n'a pas une fois l'accès protégé en place.
const NAVIGATION_PUBLIQUE = NAVIGATION.filter((lien) => !lien.visible);

const NON_RENSEIGNE = "Non renseigné";
const valeur = (texte: string) => (texte.trim() === "" ? NON_RENSEIGNE : texte.trim());

export default function PageMentionsLegales() {
  const m = MENTIONS_LEGALES;
  const manquants = champsManquants(m);
  // En production aussi, pas seulement en développement comme le prévoyait
  // le cadrage (décision de la personne responsable du projet) : un site en
  // ligne sans mentions n'est pas conforme, c'est là que le signal compte.
  const avertir = manquants.length > 0;
  const sectionsIncompletes = new Set(
    CHAMPS_REQUIS.filter((champ) => manquants.includes(champ.libelle)).map((champ) => champ.section)
  );
  const aCompleter = (section: (typeof CHAMPS_REQUIS)[number]["section"]) =>
    avertir && sectionsIncompletes.has(section) ? <Badge ton="negatif">À compléter</Badge> : undefined;
  const courriel = m.editeur.courriel.trim();

  return (
    <AppLayout nom={NOM_APP} sousTitre="Mentions légales" navigation={NAVIGATION_PUBLIQUE}>
      {/* Lisible par le public, puisque l'avertissement vaut aussi en
          production : aucun chemin de fichier ici, la skill solstice-ui dit
          où remplir. */}
      {avertir && (
        <div className="sl-note" role="status">
          <b>Mentions légales incomplètes.</b> Champs requis non renseignés : {manquants.join(" ; ")}.
        </div>
      )}

      <Carte titre="Éditeur" actions={aCompleter("editeur")}>
        <dl className="sl-fiche">
          <dt>Nom ou raison sociale</dt>
          <dd>{valeur(m.editeur.nom)}</dd>
          {m.editeur.formeJuridique.trim() !== "" && (
            <>
              <dt>Forme juridique</dt>
              <dd>{m.editeur.formeJuridique}</dd>
            </>
          )}
          {m.editeur.capital.trim() !== "" && (
            <>
              <dt>Capital</dt>
              <dd>{m.editeur.capital}</dd>
            </>
          )}
          <dt>Adresse</dt>
          <dd className="sl-texte-long">{valeur(m.editeur.adresse)}</dd>
          <dt>Téléphone</dt>
          <dd>{valeur(m.editeur.telephone)}</dd>
          <dt>Courriel</dt>
          <dd>{courriel === "" ? NON_RENSEIGNE : <a href={`mailto:${courriel}`}>{courriel}</a>}</dd>
          {m.editeur.immatriculation.trim() !== "" && (
            <>
              <dt>Immatriculation</dt>
              <dd>{m.editeur.immatriculation}</dd>
            </>
          )}
          {m.editeur.tva.trim() !== "" && (
            <>
              <dt>TVA intracommunautaire</dt>
              <dd>{m.editeur.tva}</dd>
            </>
          )}
        </dl>
      </Carte>

      <Carte titre="Directeur de la publication" actions={aCompleter("directeur")}>
        <dl className="sl-fiche">
          <dt>Nom</dt>
          <dd>{valeur(m.directeurPublication)}</dd>
        </dl>
      </Carte>

      <Carte titre="Hébergeur" actions={aCompleter("hebergeur")}>
        <dl className="sl-fiche">
          <dt>Nom ou raison sociale</dt>
          <dd>{valeur(m.hebergeur.nom)}</dd>
          <dt>Adresse</dt>
          <dd className="sl-texte-long">{valeur(m.hebergeur.adresse)}</dd>
          <dt>Téléphone</dt>
          <dd>{valeur(m.hebergeur.telephone)}</dd>
        </dl>
      </Carte>

      {/* Le RGPD a sa propre page : les mentions légales y renvoient
          plutôt que de la recopier. */}
      <Carte titre="Données personnelles">
        <p>
          Voir la <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </Carte>
    </AppLayout>
  );
}
