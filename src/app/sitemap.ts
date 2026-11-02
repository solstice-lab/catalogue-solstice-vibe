import type { MetadataRoute } from "next";
import { planDuSite } from "@/lib/referencement";

// Lu à chaque requête, pour la même raison que robots.ts.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return planDuSite();
}
