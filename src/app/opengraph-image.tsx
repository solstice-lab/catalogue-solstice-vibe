import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { couleursDeLImage } from "@/lib/image-partage";
import { descriptionAffichee, nomAffiche } from "@/lib/referencement";

/*
 * L'image de l'aperçu au partage (Open Graph ; twitter-image.tsx la reprend).
 * Générée au build : une image n'exécute aucun script, la CSP à
 * nonce de src/proxy.ts ne la concerne pas, et rien n'y dépend de la requête.
 *
 * Les couleurs et le rayon viennent de tokens.css (src/lib/image-partage.ts).
 * Les style={{…}} sont ceux de Satori, qui dessine l'image : il ne lit aucune
 * feuille de style. La police est Geist, embarquée par next/og : le thème
 * charge la sienne par next/font/local en woff2, que Satori ne lit pas.
 */

const nom = nomAffiche();
const description = descriptionAffichee();

export const alt = nom;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ImageDePartage() {
  const theme = couleursDeLImage(await readFile(join(process.cwd(), "src/ui/theme/tokens.css"), "utf8"));
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 80,
        background: theme.structure,
      }}
    >
      <div style={{ width: 14, background: theme.accent, borderRadius: theme.rayon }} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          paddingLeft: 56,
          color: theme.texte,
        }}
      >
        <div style={{ fontSize: 72, lineHeight: 1.1 }}>{nom}</div>
        <div style={{ marginTop: 24, fontSize: 34, lineHeight: 1.35, opacity: 0.85 }}>{description}</div>
      </div>
    </div>,
    size
  );
}
