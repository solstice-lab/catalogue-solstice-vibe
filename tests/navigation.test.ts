import { describe, expect, it } from "vitest";
import { jouer } from "./aide-session";
import { liensVisibles } from "../src/ui/AppLayout";
import { NAVIGATION } from "../src/lib/navigation";
import { DROITS, type Role } from "../src/config/acces";
import { peut } from "../src/briques/comptes/roles";
import { UTILISATEURS_DEMO } from "../src/briques/comptes/demo";

// Ce fichier est copié dans toute appli qui garde la brique données : il ne
// nomme aucune brique que l'assembleur peut retirer (les cas propres au
// module métier d'une appli vivent dans un test de cette appli).
// Le module « dossiers », patron de la brique, sert de cas témoin.
//
// Pour le cas « DROITS se resserre » : l'action des dossiers, ouverte à tous
// aujourd'hui, est réservée à l'admin le temps du test, dans la configuration
// elle-même (src/config/acces.ts). Le reste est le vrai.
async function hrefsVisibles(role: Role | null): Promise<string[]> {
  jouer(role);
  return (await liensVisibles(NAVIGATION)).map((lien) => lien.href);
}

describe("menu selon le rôle", () => {
  it("propose à l'admin tout le menu, dans l'ordre : le menu n'a pas changé pour lui", async () => {
    expect(await hrefsVisibles("admin")).toEqual(NAVIGATION.map((lien) => lien.href));
  });

  it("garde à un membre ce que ses droits ouvrent : l'accueil et les dossiers restent au menu", async () => {
    const hrefs = await hrefsVisibles("membre");
    expect(hrefs).toContain("/");
    expect(hrefs.includes("/dossiers")).toBe(peut(UTILISATEURS_DEMO.membre, "dossiers.acceder"));
  });

  it("ne propose que l'accueil quand personne n'est connecté (refus par défaut)", async () => {
    expect(await hrefsVisibles(null)).toEqual(["/"]);
  });

  it("retire du menu une entrée dont DROITS se resserre, sans autre changement", async () => {
    expect(await hrefsVisibles("membre")).toContain("/dossiers");
    const droits = DROITS as Record<string, readonly string[]>;
    const avant = droits["dossiers.acceder"];
    droits["dossiers.acceder"] = ["admin"];
    try {
      expect(peut(UTILISATEURS_DEMO.membre, "dossiers.acceder")).toBe(false);
      expect(await hrefsVisibles("membre")).not.toContain("/dossiers");
      expect(await hrefsVisibles("admin")).toContain("/dossiers");
    } finally {
      droits["dossiers.acceder"] = avant;
    }
  });

  it("verrouille l'oubli : toute entrée du menu, hors l'accueil, déclare son garde — une entrée ajoutée sans garde serait proposée à tous, comme avant la correction", () => {
    const sansGarde = NAVIGATION.filter((lien) => lien.href !== "/" && !lien.visible).map((lien) => lien.href);
    expect(sansGarde).toEqual([]);
  });
});
