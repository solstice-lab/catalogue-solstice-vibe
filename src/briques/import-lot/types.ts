import type { transaction } from "@/lib/db/client";

// Le client que reçoit une transaction : l'appli écrit avec lui, jamais avec
// query() directement, sinon son écriture sortirait de la transaction de la
// confirmation (et l'échec au milieu laisserait un état partiel).
export type Client = Parameters<Parameters<typeof transaction>[0]>[0];

/** Une ligne lue d'un fichier, avant tout typage : cellules par en-tête. */
export type LigneBrute = {
  /** Numéro de la ligne dans le tableur (l'en-tête est la ligne 1, donc la première donnée est la 2). */
  numero: number;
  cellules: Record<string, unknown>;
};

export type LigneEcartee = { numero: number; motif: string };
