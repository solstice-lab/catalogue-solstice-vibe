/*
 * Le nom d'un espace et le prénom qu'on y porte, en calcul pur : importable
 * côté client.
 *
 * Les deux finissent dans le mail d'invitation. Dans une appli à entrée
 * ouverte, n'importe qui crée un compte, puis un espace : un nom qui serait un
 * lien ou une adresse ferait de l'appli un relais de publicité vers n'importe
 * quelle boîte (ticket de la brique). La brique mails échappe le HTML, mais
 * une messagerie rend cliquable un « exemple.com » écrit en texte. D'où le
 * refus d'un « @ », d'un « :// », d'un « www. » et d'un point entre deux
 * lettres ou chiffres : « St.Jean » s'écrit « St Jean ». Le refus du « @ »
 * garde aussi l'adresse e-mail hors du prénom affiché aux autres membres.
 */

export type Saisie = { valeur: string } | { erreur: string };

const RESSEMBLE_A_UN_LIEN = /@|:\/\/|www\.|[\p{L}\p{N}]\.[\p{L}\p{N}]/iu;
// Les caractères de contrôle, saut de ligne compris (le nettoyage a déjà
// changé les blancs en espaces).
const CONTROLE = /[\u0000-\u001f\u007f]/;

function verifier(saisie: string, quoi: string, longueurMax: number): Saisie {
  const valeur = saisie.replace(/\s+/g, " ").trim();
  if (valeur === "") return { erreur: `${quoi} est vide.` };
  if (valeur.length > longueurMax) return { erreur: `${quoi} dépasse ${longueurMax} caractères.` };
  if (CONTROLE.test(valeur)) return { erreur: `${quoi} contient un caractère non imprimable.` };
  if (RESSEMBLE_A_UN_LIEN.test(valeur)) {
    return {
      erreur: `${quoi} ne peut contenir ni adresse e-mail ni lien : pas de « @ », ni de point entre deux lettres.`,
    };
  }
  return { valeur };
}

export function verifierNom(saisie: string): Saisie {
  return verifier(saisie, "Le nom", 80);
}

export function verifierPrenom(saisie: string): Saisie {
  return verifier(saisie, "Le prénom", 40);
}
