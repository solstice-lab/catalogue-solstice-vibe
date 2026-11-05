import { describe, expect, it } from "vitest";
import { jouer } from "./aide-session";
import { liensVisibles } from "../src/ui/AppLayout";
import { NAVIGATION } from "../src/lib/navigation";
import { DROITS, type Role } from "../src/config/acces";

// Ce fichier est copié dans toute appli qui garde la brique comptes : il ne
// nomme ni module, ni page, ni brique que l'assembleur peut retirer. Il lit la
// navigation déclarée et les droits tels qu'ils sont, quels qu'ils soient : une
// appli y ajoute ses entrées sans toucher au test (les cas propres au module
// métier d'une appli vivent dans un test de cette appli).
//
// Il a d'abord pris pour cas témoin les écrans du patron « dossiers », que
// l'assembleur ne livre plus : le test dépendait d'un module que l'appli n'a pas.
//
// Pour le cas « DROITS se resserre » : tous les droits sont réservés à l'admin
// le temps du test, dans la configuration elle-même (src/config/acces.ts). Le
// reste est le vrai.
async function hrefsVisibles(role: Role | null): Promise<string[]> {
  jouer(role);
  return (await liensVisibles(NAVIGATION)).map((lien) => lien.href);
}

describe("menu selon le rôle", () => {
  it("propose à l'admin tout le menu, dans l'ordre : le menu n'a pas changé pour lui", async () => {
    expect(await hrefsVisibles("admin")).toEqual(NAVIGATION.map((lien) => lien.href));
  });

  it("ne propose à un membre que des entrées du menu de l'admin, dans le même ordre, l'accueil comprise", async () => {
    const admin = await hrefsVisibles("admin");
    const membre = await hrefsVisibles("membre");
    expect(membre).toContain("/");
    expect(admin.filter((href) => membre.includes(href))).toEqual(membre);
  });

  it("ne propose que l'accueil quand personne n'est connecté (refus par défaut)", async () => {
    expect(await hrefsVisibles(null)).toEqual(["/"]);
  });

  it("retire du menu toute entrée dont DROITS se resserre, sans autre changement", async () => {
    const droits = DROITS as Record<string, readonly string[]>;
    const avant = { ...droits };
    const tousLesDroits = await hrefsVisibles("admin");
    for (const action of Object.keys(droits)) droits[action] = ["admin"];
    try {
      // Plus rien n'est ouvert au membre hors l'accueil, que ses droits ne
      // gardent pas ; l'admin garde tout son menu.
      expect(await hrefsVisibles("membre")).toEqual(["/"]);
      expect(await hrefsVisibles("admin")).toEqual(tousLesDroits);
    } finally {
      for (const action of Object.keys(droits)) droits[action] = avant[action];
    }
  });

  it("verrouille l'oubli : toute entrée du menu, hors l'accueil, déclare son garde — une entrée ajoutée sans garde serait proposée à tous, comme avant la correction", () => {
    const sansGarde = NAVIGATION.filter((lien) => lien.href !== "/" && !lien.visible).map((lien) => lien.href);
    expect(sansGarde).toEqual([]);
  });
});
