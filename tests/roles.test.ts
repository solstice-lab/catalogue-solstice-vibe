import { describe, expect, it } from "vitest";
import { jouer } from "./aide-session";
import { ACTIONS, DROITS, ROLE_PAR_DEFAUT, ROLES, type Action, type Role } from "../src/config/acces";
import { UTILISATEURS_DEMO } from "../src/briques/comptes/demo";
import { exiger, type DroitsDe, peut, utilisateurCourant, utilisateurDeLEmail } from "../src/briques/comptes/roles";

// Ce fichier est copié dans toute appli : il ne nomme aucune action ni aucun
// module, il parcourt ceux que déclare src/config/acces.ts. Les droits propres
// à un module se vérifient dans le test du module.

// notFound() lève une erreur dont le digest porte le code 404.
const UN_404 = { digest: expect.stringContaining("404") };

// Les tests jouent l'admin de démo par défaut (tests/setup.ts) : un test de
// refus ne joue personne. La session elle-même : tests/comptes-session.test.ts.
function personne(): void {
  jouer(null);
}

describe("refus par défaut", () => {
  it("ne laisse passer aucune action sans utilisateur : avant le refus par défaut, un visiteur sans cookie jouait l'admin", async () => {
    personne();
    expect(await utilisateurCourant()).toBeNull();
    // Une action fictive en plus : une appli sans module n'en déclare aucune,
    // et le refus doit s'y vérifier quand même.
    const fictive = "exemple.consulter" as Action;
    expect(peut(null, fictive)).toBe(false);
    await expect(exiger(fictive)).rejects.toMatchObject(UN_404);
    for (const action of ACTIONS) {
      expect(peut(null, action), action).toBe(false);
      await expect(exiger(action), action).rejects.toMatchObject(UN_404);
    }
  });

  it("ne laisse passer aucune action à un rôle que la configuration ne déclare pas (un rôle retiré de ROLES n'ouvre plus rien)", () => {
    const inconnu = { email: "inconnu@demo.solstice-lab.example", role: "superadmin" };
    for (const action of ACTIONS) expect(peut(inconnu, action), action).toBe(false);
  });

  it("refuse exiger() à une personne connectée dont le rôle n'est plus déclaré (un rôle retiré de la configuration n'ouvre plus rien)", async () => {
    jouer("superadmin");
    expect((await utilisateurCourant())?.role).toBe("superadmin");
    for (const action of ACTIONS) await expect(exiger(action), action).rejects.toMatchObject(UN_404);
  });

  it("donne une action à un rôle si et seulement si DROITS la lui accorde", () => {
    const droits: Readonly<Record<string, readonly string[] | undefined>> = DROITS;
    for (const role of ROLES) {
      for (const action of ACTIONS) {
        const accordes = droits[action] ?? [];
        expect(peut(UTILISATEURS_DEMO[role], action), `${role} → ${action}`).toBe(accordes.includes(role));
      }
    }
  });

  it("laisse passer exiger(action) si et seulement si DROITS l'accorde au rôle joué, et rend l'utilisateur", async () => {
    for (const role of ROLES) {
      jouer(role);
      for (const action of ACTIONS) {
        if (peut(UTILISATEURS_DEMO[role], action)) {
          await expect(exiger(action), `${role} → ${action}`).resolves.toEqual(UTILISATEURS_DEMO[role]);
        } else {
          await expect(exiger(action), `${role} → ${action}`).rejects.toMatchObject(UN_404);
        }
      }
    }
  });

  it("laisse passer exiger() avec plusieurs actions dès qu'une seule est accordée, et refuse si aucune ne l'est", async () => {
    for (const role of ROLES) {
      jouer(role);
      const accordees = ACTIONS.filter((action) => peut(UTILISATEURS_DEMO[role], action));
      const refusees = ACTIONS.filter((action) => !peut(UTILISATEURS_DEMO[role], action));
      for (const accordee of accordees) {
        // L'action accordée en dernier : exiger() ne s'arrête pas à la première.
        const [premiere, ...suivantes]: Action[] = [...refusees, accordee];
        await expect(exiger(premiere, ...suivantes)).resolves.toEqual(UTILISATEURS_DEMO[role]);
      }
      if (refusees.length > 0) {
        const [premiere, ...autres] = refusees;
        await expect(exiger(premiere, ...autres)).rejects.toMatchObject(UN_404);
      }
    }
  });
});

describe("configuration des droits", () => {
  it("donne au moins un rôle déclaré à chaque action, et le rôle par défaut est déclaré", () => {
    // Lu comme un dictionnaire : une appli sans module n'a aucune action, et
    // `Droits` y est un type vide.
    const droits: Readonly<Record<string, readonly string[] | undefined>> = DROITS;
    expect(Object.keys(droits).sort()).toEqual([...ACTIONS].sort());
    for (const action of ACTIONS) {
      const roles = droits[action] ?? [];
      expect(roles.length, action).toBeGreaterThan(0);
      for (const role of roles) expect(ROLES, action).toContain(role);
    }
    expect(ROLES).toContain(ROLE_PAR_DEFAUT);
  });

  // Sur des actions fictives : une appli sans module n'a aucune action, et ce
  // fichier doit y typer de même. DROITS est déclaré `satisfies Droits`, le
  // même type.
  it("fait échouer le typecheck pour une action oubliée, une liste de rôles vide ou un rôle non déclaré (une ligne @ts-expect-error sans erreur fait échouer le typecheck)", () => {
    type Fictives = "exemple.consulter" | "exemple.gerer";
    // @ts-expect-error -- « exemple.gerer » est déclarée sans rôle.
    const oubli: DroitsDe<Fictives, Role> = { "exemple.consulter": [ROLE_PAR_DEFAUT] };
    // @ts-expect-error -- une liste vide ne donne l'action à personne : à retirer plutôt qu'à vider.
    const vide: DroitsDe<Fictives, Role> = { "exemple.consulter": [ROLE_PAR_DEFAUT], "exemple.gerer": [] };
    const inconnu: DroitsDe<Fictives, Role> = {
      // @ts-expect-error -- « superadmin » n'est pas dans ROLES (au plus près de
      // l'erreur : Prettier a mis l'objet sur plusieurs lignes).
      "exemple.consulter": ["superadmin"],
      "exemple.gerer": [ROLE_PAR_DEFAUT],
    };
    const complet: DroitsDe<Fictives, Role> = {
      "exemple.consulter": [ROLE_PAR_DEFAUT],
      "exemple.gerer": [ROLE_PAR_DEFAUT],
    };
    expect([oubli, vide, inconnu, complet]).toHaveLength(4);
  });
});

describe("utilisateurs de démo", () => {
  it("donne à chaque rôle une adresse différente et fictive : la brique validation exige un décideur identifié, et la règle « pas son propre demandeur » se vérifie avec deux personnes", () => {
    const adresses = ROLES.map((role) => UTILISATEURS_DEMO[role].email);
    expect(new Set(adresses).size).toBe(ROLES.length);
    for (const adresse of adresses) expect(adresse).toMatch(/\.example$/);
  });

  it("retrouve une personne par son adresse pour le décideur de la brique validation, et personne pour une adresse inconnue", async () => {
    for (const role of ROLES)
      expect(await utilisateurDeLEmail(UTILISATEURS_DEMO[role].email)).toEqual(UTILISATEURS_DEMO[role]);
    expect(await utilisateurDeLEmail("inconnu@demo.solstice-lab.example")).toBeNull();
  });
});
