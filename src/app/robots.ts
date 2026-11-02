import type { MetadataRoute } from "next";
import { reglesRobots } from "@/lib/referencement";

// Lu à chaque requête : Next met robots.ts en cache au build par défaut, et
// URL_PUBLIQUE est une variable de l'hébergeur. Figée au build, la réponse
// d'une même image serait celle de la recette en production, ou l'inverse.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return reglesRobots();
}
