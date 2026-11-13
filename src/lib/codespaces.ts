/*
 * L'appli de développement ouverte dans GitHub Codespaces. À l'essai du
 * 2026-11-13, aucun formulaire n'y passait : le proxy du Codespace transmet
 * l'en-tête Origin « localhost:3000 » et, en x-forwarded-host, l'adresse
 * redirigée « <codespace>-3000.<domaine> ». Next refusait la Server Action de
 * connexion, les briques qui contrôlent l'origine refusaient leur Route
 * Handler : les deux ne correspondaient pas.
 *
 * L'exception ne vaut que dans un Codespace (les deux variables qu'il pose)
 * et hors production : partout ailleurs, aucune origine de plus n'est admise.
 * Le port 3000 est celui que redirige .devcontainer/devcontainer.json.
 */

const ORIGINE_DU_PROXY = "localhost:3000";

function dansUnCodespaceHorsProduction(): { nom: string; domaine: string } | null {
  if (process.env.NODE_ENV === "production") return null;
  const nom = process.env.CODESPACE_NAME;
  const domaine = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  return nom && domaine ? { nom, domaine } : null;
}

/** Les origines que Next doit admettre en plus pour les Server Actions (`next.config.ts`). */
export function originesDuCodespace(): string[] {
  return dansUnCodespaceHorsProduction() ? [ORIGINE_DU_PROXY] : [];
}

/**
 * Vrai si une requête au Route Handler vient du navigateur de ce Codespace :
 * l'origine que transmet le proxy, adressée à l'hôte redirigé du même
 * Codespace. Pour les contrôles d'origine faits à la main.
 */
export function origineDuCodespace(origine: string, hote: string): boolean {
  const codespace = dansUnCodespaceHorsProduction();
  if (!codespace) return false;
  let hoteDeLOrigine: string;
  try {
    hoteDeLOrigine = new URL(origine).host;
  } catch {
    return false;
  }
  return hoteDeLOrigine === ORIGINE_DU_PROXY && hote === `${codespace.nom}-3000.${codespace.domaine}`;
}
