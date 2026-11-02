export type FormatFichier = "xlsx" | "xls" | "csv" | "inconnu";

// Format reconnu à la signature du contenu, jamais à l'extension : un fichier
// renommé ou réenregistré ne doit pas faire échouer l'import. Une appli livrée
// fait de même (signature zip du .xlsx). Le .xls (OLE) est reconnu pour être refusé avec un
// message clair, pas lu de travers.
export function reconnaitreFormat(octets: Uint8Array): FormatFichier {
  if (octets.length === 0) return "inconnu";
  if (commence(octets, [0x50, 0x4b, 0x03, 0x04])) return "xlsx";
  if (commence(octets, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "xls";
  // Un octet nul ne se trouve pas dans un texte : un binaire n'est pas un CSV.
  const debut = octets.subarray(0, 4096);
  if (debut.includes(0)) return "inconnu";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(debut);
  } catch {
    // Une coupure au milieu d'un caractère de plus de 4 Ko n'est pas une
    // erreur ; un texte non UTF-8 (ancien Excel en Windows-1252) n'est pas
    // lu : mieux vaut refuser que mal lire les accents.
    return decodeSansCoupure(debut) ? "csv" : "inconnu";
  }
  return "csv";
}

function commence(octets: Uint8Array, signature: number[]): boolean {
  return signature.every((octet, i) => octets[i] === octet);
}

// Réessaie sans les trois derniers octets, qui peuvent couper un caractère.
function decodeSansCoupure(debut: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(debut.subarray(0, Math.max(0, debut.length - 3)));
    return true;
  } catch {
    return false;
  }
}
