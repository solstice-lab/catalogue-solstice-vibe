import { describe, expect, it } from "vitest";
import { ALPHABET_CODE, afficherCode, lienPourRejoindre, normaliserCode } from "../src/briques/espaces/code";
import { verifierNom, verifierPrenom } from "../src/briques/espaces/saisie";

/*
 * Ce qui se saisit dans la brique espaces, en calcul pur : le code
 * d'invitation, le nom d'un espace et le prénom qu'on y porte.
 */

describe("le code d'invitation", () => {
  it("n'a aucun caractère ambigu : ni 0 ni O, ni 1, I ni L (un code lu de travers au téléphone)", () => {
    for (const ambigu of ["0", "O", "1", "I", "L"]) expect(ALPHABET_CODE).not.toContain(ambigu);
    expect(new Set(ALPHABET_CODE).size).toBe(ALPHABET_CODE.length);
  });

  it("se lit sans tenir compte de la casse, des espaces ni du tiret", () => {
    expect(normaliserCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normaliserCode("AB CD EF GH")).toBe("ABCDEFGH");
    expect(normaliserCode("abcdefgh")).toBe("ABCDEFGH");
  });

  it("refuse un code de la mauvaise longueur ou hors de son alphabet, sans le deviner", () => {
    expect(normaliserCode("ABCDEFG")).toBeNull();
    expect(normaliserCode("ABCDEFGHJ")).toBeNull();
    expect(normaliserCode("ABCDEFG0")).toBeNull();
    expect(normaliserCode("")).toBeNull();
  });

  it("s'affiche en deux groupes de quatre, et le lien pour rejoindre le porte", () => {
    expect(afficherCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(lienPourRejoindre(new URL("https://appli.example"), "ABCDEFGH")).toBe(
      "https://appli.example/espace/rejoindre?code=ABCD-EFGH"
    );
  });
});

describe("le nom d'un espace et le prénom qu'on y porte", () => {
  it("se gardent sans espaces superflus, accents compris", () => {
    expect(verifierNom("  Coloc  de la rue Saint-Jean ")).toEqual({ valeur: "Coloc de la rue Saint-Jean" });
    expect(verifierPrenom(" Zoé ")).toEqual({ valeur: "Zoé" });
  });

  it("refusent un texte vide ou trop long", () => {
    expect(verifierNom("   ")).toHaveProperty("erreur");
    expect(verifierPrenom("")).toHaveProperty("erreur");
    expect(verifierNom("a".repeat(81))).toHaveProperty("erreur");
    expect(verifierPrenom("a".repeat(41))).toHaveProperty("erreur");
  });

  it("refusent ce qui ressemble à une adresse ou à un lien : une entrée ouverte ne fait pas de l'appli un relais d'envoi (ticket), et le prénom n'est jamais l'adresse", () => {
    for (const texte of [
      "alice@exemple.fr",
      "https://exemple.fr",
      "www.exemple",
      "exemple.com",
      "gagnez-ici.xyz/promo",
    ]) {
      expect(verifierNom(texte), texte).toHaveProperty("erreur");
      expect(verifierPrenom(texte), texte).toHaveProperty("erreur");
    }
  });

  it("refusent un caractère de contrôle", () => {
    expect(verifierNom("Coloc\u0007")).toHaveProperty("erreur");
  });
});
