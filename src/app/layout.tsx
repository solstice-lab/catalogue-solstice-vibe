import type { Metadata } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import { metadonneesRacine } from "@/lib/referencement";
import "./globals.css";
import { BandeauSession } from "@/briques/comptes/BandeauSession";

// Polices du thème par défaut (charte Solstice), servies depuis le dépôt :
// next/font/google télécharge les fichiers chez Google à chaque build, et un
// téléchargement refusé a fait échouer trois CI sans rapport avec leur diff.
// Les woff2 et leur licence sont dans src/ui/theme/polices/.
// Pour thématiser un client : déposer ses woff2 à côté et adapter ces appels
// next/font/local, en gardant les mêmes noms de variables CSS — tokens.css
// consomme --police-sans et --police-mono, rien d'autre à toucher.
const policeSans = localFont({
  src: [
    { path: "../ui/theme/polices/IBMPlexSans-Light-Latin1.woff2", weight: "300" },
    { path: "../ui/theme/polices/IBMPlexSans-Regular-Latin1.woff2", weight: "400" },
    { path: "../ui/theme/polices/IBMPlexSans-Medium-Latin1.woff2", weight: "500" },
    { path: "../ui/theme/polices/IBMPlexSans-SemiBold-Latin1.woff2", weight: "600" },
    { path: "../ui/theme/polices/IBMPlexSans-Bold-Latin1.woff2", weight: "700" },
  ],
  variable: "--police-sans",
});
const policeMono = localFont({
  src: [
    { path: "../ui/theme/polices/IBMPlexMono-Regular-Latin1.woff2", weight: "400" },
    { path: "../ui/theme/polices/IBMPlexMono-Medium-Latin1.woff2", weight: "500" },
    { path: "../ui/theme/polices/IBMPlexMono-SemiBold-Latin1.woff2", weight: "600" },
  ],
  variable: "--police-mono",
});

// Titre, description, aperçu au partage et noindex : src/lib/referencement.ts.
// Calculées à chaque requête : URL_PUBLIQUE est une variable de l'hébergeur.
export function generateMetadata(): Metadata {
  return metadonneesRacine();
}

export default async function RacineLayout({ children }: { children: React.ReactNode }) {
  // Rendu à chaque requête, imposé ici : la CSP de src/proxy.ts n'autorise
  // que les scripts porteurs du nonce de la requête, et une page rendue au
  // build n'en a aucun — elle s'afficherait sans qu'aucun script ne tourne.
  // Le bandeau de session de la brique comptes (un cookie) rend déjà tout
  // dynamique, mais une appli sans la brique ne l'a pas : sans cette ligne,
  // toute page rendue au build serait cassée en silence.
  await connection();

  return (
    <html lang="fr" className={`${policeSans.variable} ${policeMono.variable}`}>
      <body>
        <BandeauSession />
        {children}
      </body>
    </html>
  );
}
