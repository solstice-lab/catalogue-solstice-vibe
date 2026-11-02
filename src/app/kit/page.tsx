import type { Metadata } from "next";
import { NAVIGATION, NOM_APP } from "@/lib/navigation";
import { Vitrine } from "./Vitrine";

// Jamais indexée, même sur un site public : la vitrine du kit montre des
// données fictives, et ne s'adresse qu'à l'équipe.
export const metadata: Metadata = { title: "Kit UI", robots: { index: false, follow: false } };

// Hors navigation : la vitrine sert à qui thématise (skill solstice-ui), pas
// aux utilisateurs de l'appli. Sans donnée réelle, elle peut être prérendue.
// Elle montre le menu entier, sans filtre par rôle : on y vérifie le thème de
// chaque lien, et les gardes de NAVIGATION lisent un cookie, absent d'une page
// prérendue.
export default function PageKit() {
  const liens = NAVIGATION.map(({ libelle, href }) => ({ libelle, href }));
  return <Vitrine nom={NOM_APP} navigation={liens} />;
}
