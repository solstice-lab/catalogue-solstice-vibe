import Link from "next/link";
import { AppLayout, Badge, Carte } from "@/ui";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { CONFIDENTIALITE, champsManquants, lieuDe, traitements, type Traitement } from "@/lib/confidentialite";
import { MENTIONS_LEGALES } from "@/lib/mentions-legales";
import { metadonneesDePage } from "@/lib/referencement";

export function generateMetadata() {
  return metadonneesDePage({ titre: "Politique de confidentialité", chemin: "/confidentialite" });
}

// Ouverte à tout visiteur, sans garde, comme /mentions-legales : chaque
// personne dont le site traite les données doit pouvoir la lire, compte ou
// pas (RGPD art. 13). La page ne lit donc ni la base ni la session
// (tests/confidentialite.test.ts le verrouille), et le menu ne garde que les
// entrées sans garde.
const NAVIGATION_PUBLIQUE = NAVIGATION.filter((lien) => !lien.visible);

const NON_RENSEIGNE = "Non renseigné";
const valeur = (texte: string | undefined) => ((texte ?? "").trim() === "" ? NON_RENSEIGNE : (texte ?? "").trim());

export default function PageConfidentialite() {
  const config = CONFIDENTIALITE;
  const mentions = MENTIONS_LEGALES;
  const manquants = champsManquants(config, mentions);
  // En production aussi, comme les mentions légales : une politique
  // incomplète en ligne est précisément ce qu'il faut voir.
  const avertir = manquants.length > 0;
  const sectionsIncompletes = new Set(manquants.map((champ) => champ.section));
  const aCompleter = (section: string) =>
    avertir && sectionsIncompletes.has(section) ? <Badge ton="negatif">À compléter</Badge> : undefined;
  const courriel = config.contact.courriel.trim();
  const lienCourriel = courriel === "" ? NON_RENSEIGNE : <a href={`mailto:${courriel}`}>{courriel}</a>;
  const delegue = config.contact.delegue.trim();

  const carteTraitement = (traitement: Traitement) => {
    const choix = config.choix[traitement.cle];
    return (
      <Carte key={traitement.cle} titre={traitement.titre} actions={aCompleter(traitement.cle)}>
        <dl className="sl-fiche">
          <dt>Finalité</dt>
          <dd>{traitement.finalite}</dd>
          <dt>Données</dt>
          <dd>
            <ul className="sl-liste-simple">
              {traitement.donnees.map((donnee) => (
                <li key={donnee}>{donnee}</li>
              ))}
            </ul>
          </dd>
          <dt>Personnes concernées</dt>
          <dd>{traitement.personnes}</dd>
          <dt>Base légale</dt>
          <dd>{valeur(choix?.baseLegale)}</dd>
          <dt>Durée de conservation</dt>
          <dd>{valeur(choix?.duree)}</dd>
          <dt>Destinataires</dt>
          <dd>{valeur(choix?.destinataires)}</dd>
          {traitement.sousTraitants.length > 0 && (
            <>
              <dt>Sous-traitants</dt>
              <dd>
                <ul className="sl-liste-simple">
                  {traitement.sousTraitants.map((sousTraitant) => (
                    <li key={sousTraitant.cle}>
                      {valeur(sousTraitant.nom)} — {sousTraitant.role} Lieu de traitement :{" "}
                      {valeur(lieuDe(sousTraitant, config))}.
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
          {traitement.precisions.length > 0 && (
            <>
              <dt>Précisions</dt>
              <dd>
                <ul className="sl-liste-simple">
                  {traitement.precisions.map((precision) => (
                    <li key={precision}>{precision}</li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>
      </Carte>
    );
  };

  const presents = traitements(mentions, config);

  return (
    <AppLayout nom={NOM_APP} sousTitre="Politique de confidentialité" navigation={NAVIGATION_PUBLIQUE}>
      {/* Lisible par le public, puisque l'avertissement vaut aussi en
          production : aucun chemin de fichier ici, la skill solstice-ui dit
          où remplir. */}
      {avertir && (
        <div className="sl-note" role="status">
          <b>Politique de confidentialité incomplète.</b> Champs requis non renseignés :{" "}
          {manquants.map((champ) => champ.libelle).join(" ; ")}.
        </div>
      )}

      <Carte titre="Responsable du traitement" actions={aCompleter("responsable")}>
        <dl className="sl-fiche">
          <dt>Nom ou raison sociale</dt>
          <dd>{valeur(mentions.editeur.nom)}</dd>
          <dt>Coordonnées</dt>
          <dd>
            Voir les <Link href="/mentions-legales">mentions légales</Link>.
          </dd>
          <dt>Exercer vos droits</dt>
          <dd>{lienCourriel}</dd>
          {delegue !== "" && (
            <>
              <dt>Délégué à la protection des données</dt>
              <dd>{delegue}</dd>
            </>
          )}
          <dt>Mise à jour</dt>
          <dd>{valeur(config.miseAJour)}</dd>
        </dl>
      </Carte>

      {presents.map(carteTraitement)}

      {/* Les données métier propres au client : le catalogue ne les décrit
          pas, la carte dit qu'elles restent à décrire tant que le projet ne
          les a pas revues. */}
      {!config.traitementsDuProjetRevus && (
        <Carte titre="Données propres à l'activité" actions={aCompleter("projet")}>
          <p>{NON_RENSEIGNE}.</p>
        </Carte>
      )}

      <Carte titre="Vos droits" actions={aCompleter("droits")}>
        {/* Les droits tels que le règlement les énumère, sans dire lesquels
            s'appliquent à quel traitement : l'opposition et la portabilité
            dépendent de la base légale, que le projet choisit. */}
        <p>
          Dans les conditions prévues par le règlement général sur la protection des données (articles 15 à 21), vous
          disposez d&apos;un droit d&apos;accès à vos données, de rectification, d&apos;effacement, de limitation du
          traitement, d&apos;opposition et de portabilité. Lorsqu&apos;un traitement repose sur votre consentement, vous
          pouvez le retirer à tout moment (article 7). Écrivez à : {lienCourriel}.
        </p>
        {/* Brique rgpd : la personne connectée télécharge elle-même ses données. */}
        <p>
          Avec un compte, vous pouvez aussi télécharger vos données depuis la page{" "}
          <Link href="/mes-donnees">Mes données</Link>.
        </p>
        {/* Fin de la brique rgpd. */}
        <p>
          Vous pouvez aussi adresser une réclamation à l&apos;autorité de contrôle : {valeur(config.autoriteDeControle)}
          .
        </p>
      </Carte>
    </AppLayout>
  );
}
