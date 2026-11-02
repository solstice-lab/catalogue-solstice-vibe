import { describe, expect, it } from "vitest";
import {
  echeanceVisible,
  libelleJours,
  libelleStatut,
  joursRestants,
  statutEcheance,
} from "../src/briques/echeances/calcul";

// Les règles de la brique, sans base ni entité : ce fichier suit la brique
// dans toute copie client, sans aucun module métier.
const AUJOURDHUI = "2026-10-14";

describe("brique échéances : calcul", () => {
  it("met en alerte une fin dans les 30 prochains jours, J+30 compris, mais pas J+31 (borne de l'alerte)", () => {
    expect(statutEcheance("2026-10-14", AUJOURDHUI, 30)).toBe("en_alerte");
    expect(statutEcheance("2026-11-13", AUJOURDHUI, 30)).toBe("en_alerte");
    expect(statutEcheance("2026-11-14", AUJOURDHUI, 30)).toBe("a_venir");
  });

  it("garde un échu tant que sa fin est passée depuis moins de 30 jours : J−29 dedans, J−30 dehors (borne des échus récents)", () => {
    expect(statutEcheance("2026-10-13", AUJOURDHUI, 30)).toBe("echu_recemment");
    expect(statutEcheance("2026-09-15", AUJOURDHUI, 30)).toBe("echu_recemment");
    expect(statutEcheance("2026-09-14", AUJOURDHUI, 30)).toBeNull();
  });

  it("compte les jours sur le calendrier, sans décalage au passage à l'heure d'hiver ni au changement d'année", () => {
    expect(joursRestants("2026-10-26", "2026-10-24")).toBe(2);
    expect(joursRestants("2027-01-01", "2026-12-31")).toBe(1);
    expect(joursRestants("2026-09-14", AUJOURDHUI)).toBe(-30);
  });

  it("dit l'écart en mots plutôt qu'en nombre signé", () => {
    expect(libelleJours(0)).toBe("Aujourd'hui");
    expect(libelleJours(1)).toBe("Demain");
    expect(libelleJours(12)).toBe("Dans 12 jours");
    expect(libelleJours(-1)).toBe("Hier");
    expect(libelleJours(-8)).toBe("Il y a 8 jours");
  });

  it("ne laisse jamais disparaître un retard quand le branchement le demande : J−30 et J−400 restent échus, sans quoi une maintenance en retard de 35 jours sortait de la vue", () => {
    expect(statutEcheance("2026-09-14", AUJOURDHUI, 30, true)).toBe("echu_recemment");
    expect(statutEcheance("2026-09-09", AUJOURDHUI, 30, true)).toBe("echu_recemment");
    expect(statutEcheance("2025-09-09", AUJOURDHUI, 30, true)).toBe("echu_recemment");
    expect(echeanceVisible("2026-09-09", AUJOURDHUI, 30, true)).toEqual({
      statut: "echu_recemment",
      joursRestants: -35,
    });
  });

  it("garde la borne des contrats quand le branchement ne dit rien : J−30 reste dehors, y compris pour la visibilité (non-régression : la borne des contrats ne bouge pas)", () => {
    expect(statutEcheance("2026-09-14", AUJOURDHUI, 30, false)).toBeNull();
    expect(echeanceVisible("2026-09-14", AUJOURDHUI, 30)).toBeNull();
  });

  it("ne change pas les bornes de l'alerte avec la demande de retard sans limite : J+30 dedans, J+31 dehors", () => {
    expect(statutEcheance("2026-11-13", AUJOURDHUI, 30, true)).toBe("en_alerte");
    expect(statutEcheance("2026-11-14", AUJOURDHUI, 30, true)).toBe("a_venir");
  });

  it("nomme « En retard » ce qui n'a pas de limite d'âge, et « Échue récemment » ce qui en a une", () => {
    expect(libelleStatut("echu_recemment")).toBe("Échue récemment");
    expect(libelleStatut("echu_recemment", true)).toBe("En retard");
    expect(libelleStatut("en_alerte")).toBe("En alerte");
    expect(libelleStatut("en_alerte", true)).toBe("En alerte");
  });
});
