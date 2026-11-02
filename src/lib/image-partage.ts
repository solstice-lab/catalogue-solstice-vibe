/*
 * Les valeurs du thème que l'image de partage (src/app/opengraph-image.tsx)
 * reprend, lues dans src/ui/theme/tokens.css au build : rethématiser un client
 * suffit, rien n'est recopié ici.
 *
 * L'image est dessinée par Satori (next/og), qui ne connaît pas les variables
 * CSS : chaque token doit y être une valeur littérale. Un var() ou un
 * color-mix() fait échouer la lecture en nommant le token, plutôt qu'une image
 * aux couleurs par défaut sans que personne ne le voie.
 */

const TOKENS = {
  structure: "--couleur-structure",
  accent: "--couleur-accent",
  texte: "--texte-sur-structure",
  rayon: "--rayon",
} as const;

export type ThemeDeLImage = Record<keyof typeof TOKENS, string>;

const COULEUR_LITTERALE = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|rgba|hsl|hsla)\([^()]*\)|[a-z]+)$/i;
const LONGUEUR_LITTERALE = /^(0|\d+(\.\d+)?px)$/;

export function couleursDeLImage(css: string): ThemeDeLImage {
  // Sans les commentaires : un token cité dans un commentaire, ou un « ; »
  // écrit dedans, fausserait la lecture.
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const theme = {} as ThemeDeLImage;
  const refus: string[] = [];
  for (const [cle, token] of Object.entries(TOKENS) as [keyof typeof TOKENS, string][]) {
    // Le token suivi de « : » : « --rayon » ne doit pas lire « --rayon-petit ».
    // La première déclaration est celle de :root, en tête de tokens.css.
    const trouve = declarations.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
    const valeur = trouve?.[1].trim();
    const attendu = cle === "rayon" ? LONGUEUR_LITTERALE : COULEUR_LITTERALE;
    if (!valeur || !attendu.test(valeur)) {
      refus.push(`${token} (${valeur ?? "absent"})`);
      continue;
    }
    theme[cle] = valeur;
  }
  if (refus.length > 0) {
    throw new Error(
      `Image de partage : tokens.css doit donner une valeur littérale (#rrggbb, rgb(), hsl(), un nom de couleur ou des px) à ${refus.join(", ")}.`
    );
  }
  return theme;
}
