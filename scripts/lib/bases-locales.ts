/*
 * Les règles de scripts/bases-locales.ts, à part pour que les tests les
 * appellent sans Docker (tests/bases-locales.test.ts). vitest.config.ts s'en
 * sert aussi : le nom de base qu'il exige est celui que le script crée.
 */

export type BasesLocales = { dev: string; test: string };

// Postgres tronque un identifiant au-delà de 63 octets, sans erreur : la base
// créée ne porterait pas le nom de l'URL affichée.
const LONGUEUR_MAX = 63;

// Le nom de l'appli est celui de package.json, que l'assembleur pose d'après
// la blueprint de l'appli (ou --nom) : « mon-appli » donne mon_appli_dev, la base que vise
// .env.example. Une portée npm (@client/…) ne fait pas partie du nom.
export function nomsDesBases(nomPaquet: string): BasesLocales {
  const appli = nomPaquet
    .replace(/^@[^/]+\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (!/^[a-z]/.test(appli)) {
    throw new Error(`Nom d'appli « ${nomPaquet} » : il doit commencer par une lettre (champ name de package.json).`);
  }
  const bases = { dev: `${appli}_dev`, test: `${appli}_test` };
  if (bases.test.length > LONGUEUR_MAX) {
    throw new Error(
      `Nom d'appli « ${nomPaquet} » trop long : « ${bases.test} » dépasse les ${LONGUEUR_MAX} caractères que Postgres garde. ` +
        "Raccourcir le champ name de package.json."
    );
  }
  return bases;
}

// Les tests vident les tables : sur un projet précédent, un `npm test` lancé
// sur la base de dev, locale elle aussi, a effacé le compte admin.
// Passent <appli>_test, que crée le script, et <appli>_test_<n>, la base
// dédiée d'une session de travail parallèle.
export function estBaseDeTest(nom: string): boolean {
  return /^.+_test(_\d+)?$/.test(nom);
}

// La ligne à coller dans .env.local : la base _dev, jamais celle des tests.
// Sans mot de passe : le Postgres du compose est en trust, publié sur
// 127.0.0.1 seulement.
export function ligneEnvLocal(bases: BasesLocales, port: number): string {
  return `DATABASE_URL=${urlLocale(bases.dev, port)}`;
}

export function urlLocale(base: string, port: number): string {
  return `postgresql://postgres@localhost:${port}/${base}`;
}
