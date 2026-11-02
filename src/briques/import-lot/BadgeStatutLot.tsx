import { Badge } from "@/ui";
import { libelleStatutLot } from "./presentation";

export function BadgeStatutLot({ statut }: { statut: string }) {
  const { libelle, ton } = libelleStatutLot(statut);
  return <Badge ton={ton}>{libelle}</Badge>;
}
