import { afterEach, beforeEach, vi } from "vitest";
import { cookiesDeTest, enTetesDeTest } from "./aide-cookies";
import { ACTIONS, ROLES } from "../src/config/acces";
import { peut } from "../src/briques/comptes/roles";
import { UTILISATEURS_DEMO } from "../src/briques/comptes/demo";
import { jouer } from "./aide-session";

// Simulé pour TOUS les fichiers de test (setupFiles) : voir aide-cookies.ts.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => {
      const valeur = cookiesDeTest.get(nom);
      return valeur === undefined ? undefined : { name: nom, value: valeur };
    },
    set: (nom: string, valeur: string) => {
      cookiesDeTest.set(nom, valeur);
    },
    delete: (cookie: string | { name: string }) => {
      cookiesDeTest.delete(typeof cookie === "string" ? cookie : cookie.name);
    },
  }),
  headers: async () => enTetesDeTest,
}));

// Brique comptes : la personne connectée des tests des modules
// est celle de tests/aide-session.ts, sans cookie ni base. Le reste du
// fichier session.ts reste le vrai (tests/comptes-session.test.ts).
// L'import dynamique : la fabrique tourne au premier import de session.ts,
// avant que les imports de ce fichier soient tous prêts.
vi.mock("../src/briques/comptes/session", async (original) => ({
  ...(await original<typeof import("../src/briques/comptes/session")>()),
  lireSession: async () => (await import("./aide-session")).personneJouee(),
  trouverUtilisateur: async (email: string) =>
    Object.values((await import("../src/briques/comptes/demo")).UTILISATEURS_DEMO).find(
      (utilisateur) => utilisateur.email === email
    ) ?? null,
}));

// Un secret de test, connu et assez long : la signature des sessions le lit.
// Jamais celui d'une vraie appli, que vitest ne voit pas. Le détecteur de
// secrets gitleaks, passé sur le dépôt avant sa publication, le prenait pour
// une vraie clé : la marque en fin de ligne l'en dispense, pas le reste du fichier.
process.env.AUTH_SECRET = "secret-des-tests-de-la-brique-comptes-0123456789"; // gitleaks:allow

// Un rôle joué par un test ne doit pas survivre au test suivant. Chaque test
// commence en jouant le rôle de démo qui a toutes les actions (l'admin ici,
// l'unique rôle d'une appli à un seul rôle) : sans personne, aucun droit
// (refus par défaut), et les tests d'un module vérifient ce qu'il
// fait, pas qui s'y connecte. Un test de refus joue personne ou un autre rôle.
const ROLE_DES_TESTS = ROLES.find((role) => ACTIONS.every((action) => peut(UTILISATEURS_DEMO[role], action)));
// Sans un tel rôle, les tests des modules échoueraient sur des 404 sans rapport
// avec ce qu'ils vérifient : le dire ici, une fois.
if (!ROLE_DES_TESTS) {
  throw new Error(
    "Aucun rôle de src/config/acces.ts n'a toutes les actions : les tests ne savent pas qui jouer (tests/setup.ts)."
  );
}
beforeEach(() => {
  jouer(ROLE_DES_TESTS);
});
// Fin de la brique comptes.
afterEach(() => {
  cookiesDeTest.clear();
  for (const nom of [...enTetesDeTest.keys()]) enTetesDeTest.delete(nom);
});
