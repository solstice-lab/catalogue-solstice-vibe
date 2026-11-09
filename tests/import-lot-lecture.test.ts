import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  ErreurFichier,
  LIGNES_MAX,
  lireFichier,
  OCTETS_DECOMPRESSES_MAX,
  OCTETS_MAX,
} from "../src/briques/import-lot/lecture";

async function classeur(remplir: (feuille: ExcelJS.Worksheet) => void): Promise<Uint8Array> {
  const livre = new ExcelJS.Workbook();
  remplir(livre.addWorksheet("Contrats"));
  return new Uint8Array(await livre.xlsx.writeBuffer());
}

const octets = (texte: string) => new TextEncoder().encode(texte);

async function classeurValide(): Promise<JSZip> {
  return JSZip.loadAsync(
    await classeur((feuille) => {
      feuille.addRow(["Référence"]);
      feuille.addRow(["C1"]);
    })
  );
}

// Zéros répétés : ils se compressent à presque rien, comme le XML d'une bombe
// de décompression réelle.
const compresser = (archive: JSZip) =>
  archive.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 1 } });

// Réécrit la taille décompressée annoncée par l'en-tête local et par le
// répertoire central, pour la seule entrée énorme (> 1 Mo) : un fichier hostile ment sur elle, et jszip ne la
// compare à la réalité qu'une fois TOUT décompressé.
function annoncerTaille(archive: Uint8Array, taille: number): Uint8Array {
  const copie = new Uint8Array(archive);
  const vue = new DataView(copie.buffer);
  for (let i = 0; i + 30 < copie.length; i++) {
    const signature = vue.getUint32(i, true);
    if (signature === 0x04034b50 && vue.getUint32(i + 22, true) > 1_000_000) vue.setUint32(i + 22, taille, true);
    if (signature === 0x02014b50 && vue.getUint32(i + 24, true) > 1_000_000) vue.setUint32(i + 24, taille, true);
  }
  return copie;
}

describe("lecture d'un fichier d'import", () => {
  it("lit un xlsx par en-têtes, numéros de ligne du tableur compris (une ligne écartée se retrouve par son numéro)", async () => {
    const fichier = await classeur((feuille) => {
      feuille.addRow(["Référence", "Montant"]);
      feuille.addRow(["C1", 100]);
      feuille.addRow([]);
      feuille.addRow(["C2", 250]);
    });
    const lecture = await lireFichier(fichier);
    expect(lecture.format).toBe("xlsx");
    expect(lecture.entetes).toEqual(["Référence", "Montant"]);
    expect(lecture.lignes).toEqual([
      { numero: 2, cellules: { Référence: "C1", Montant: 100 } },
      { numero: 4, cellules: { Référence: "C2", Montant: 250 } },
    ]);
  });

  it("l'en-tête est la première ligne non vide, même si des lignes vides la précèdent", async () => {
    const fichier = await classeur((feuille) => {
      feuille.addRow([]);
      feuille.addRow([]);
      feuille.addRow(["Référence", "Date de fin"]);
      feuille.addRow(["C1", new Date(Date.UTC(2026, 4, 13))]);
    });
    const lecture = await lireFichier(fichier);
    expect(lecture.entetes).toEqual(["Référence", "Date de fin"]);
    expect(lecture.lignes[0].numero).toBe(4);
    expect(lecture.lignes[0].cellules["Date de fin"]).toEqual(new Date(Date.UTC(2026, 4, 13)));
  });

  it("un identifiant à zéros de tête reste du texte, en xlsx comme en CSV (projet précédent)", async () => {
    const fichier = await classeur((feuille) => {
      feuille.addRow(["Matricule"]);
      feuille.addRow(["00123"]);
    });
    expect((await lireFichier(fichier)).lignes[0].cellules.Matricule).toBe("00123");
    expect((await lireFichier(octets("Matricule;Nom\n00123;Dupont\n"))).lignes[0].cellules.Matricule).toBe("00123");
  });

  it("une formule est lue par son résultat, un lien par son texte, un texte enrichi par son texte brut", async () => {
    const fichier = await classeur((feuille) => {
      feuille.addRow(["Total", "Lien", "Note"]);
      feuille.addRow([
        { formula: "10+5", result: 15 },
        { text: "Atelier", hyperlink: "https://exemple.test" },
        { richText: [{ text: "Bon " }, { text: "état" }] },
      ]);
    });
    expect((await lireFichier(fichier)).lignes[0].cellules).toEqual({ Total: 15, Lien: "Atelier", Note: "Bon état" });
  });

  it("un CSV français se lit : BOM, point-virgule, guillemets, virgule décimale laissée telle quelle", async () => {
    const lecture = await lireFichier(octets('﻿Référence;Montant;Objet\nC1;12,5;"Maintenance; annuelle"\n'));
    expect(lecture.format).toBe("csv");
    expect(lecture.entetes).toEqual(["Référence", "Montant", "Objet"]);
    expect(lecture.lignes).toEqual([
      { numero: 2, cellules: { Référence: "C1", Montant: "12,5", Objet: "Maintenance; annuelle" } },
    ]);
  });

  it("une ligne blanche dans un CSV garde les numéros des lignes suivantes : le numéro annoncé est celui du fichier", async () => {
    const lecture = await lireFichier(octets("Référence;Montant\nC1;1\n\nC3;3\n"));
    expect(lecture.lignes.filter((l) => l.cellules.Référence !== "").map((l) => l.numero)).toEqual([2, 4]);
  });

  it("une formule sans résultat enregistré est refusée avec son adresse, jamais lue comme une cellule vide", async () => {
    const fichier = await classeur((feuille) => {
      feuille.addRow(["Total"]);
      feuille.addRow([{ formula: "1+1" }]);
    });
    await expect(lireFichier(fichier)).rejects.toThrow(/A2.*formule/);
  });

  it("un fichier trop gros, ou de trop de lignes, est refusé avant d'être lu en mémoire", async () => {
    await expect(lireFichier(new Uint8Array(OCTETS_MAX + 1))).rejects.toThrow(/dépasse/);
    await expect(lireFichier(octets("Référence\n" + "x\n".repeat(LIGNES_MAX + 1)))).rejects.toThrow(/lignes/);
  });

  it("un CSV à virgules se lit aussi", async () => {
    const lecture = await lireFichier(octets("Référence,Montant\nC1,100\n"));
    expect(lecture.lignes[0].cellules).toEqual({ Référence: "C1", Montant: "100" });
  });

  it("un CSV en Windows-1252 est refusé même quand ses accents arrivent après les premiers Ko (sinon des « � » remplaceraient les lettres, sans erreur)", async () => {
    const remplissage = "Référence;Objet\n" + "C;x\n".repeat(2000);
    const windows1252 = new Uint8Array([
      ...new TextEncoder().encode(remplissage),
      ...Buffer.from("C9;Entretien général\n", "latin1"),
    ]);
    await expect(lireFichier(windows1252)).rejects.toThrow(/UTF-8/);
  });

  it("deux colonnes de même titre sont refusées : la seconde effacerait la première en silence", async () => {
    await expect(lireFichier(octets("Référence;référence\nC1;C2\n"))).rejects.toThrow(/même titre/);
    const fichier = await classeur((feuille) => {
      feuille.addRow(["Montant", "Montant "]);
      feuille.addRow([1, 2]);
    });
    await expect(lireFichier(fichier)).rejects.toThrow(/même titre/);
  });

  it("un ancien .xls est refusé avec un message qui dit quoi faire, jamais lu de travers", async () => {
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    await expect(lireFichier(ole)).rejects.toThrow(/\.xls.*\.xlsx/);
    await expect(lireFichier(ole)).rejects.toBeInstanceOf(ErreurFichier);
  });

  it("un fichier illisible est refusé avec une erreur de fichier, pas une erreur technique", async () => {
    await expect(lireFichier(Uint8Array.from([0, 1, 2, 3, 0xff]))).rejects.toBeInstanceOf(ErreurFichier);
    await expect(lireFichier(new Uint8Array())).rejects.toBeInstanceOf(ErreurFichier);
    // Signature zip, contenu qui n'est pas un classeur.
    await expect(lireFichier(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]))).rejects.toBeInstanceOf(
      ErreurFichier
    );
  });

  it("un classeur sans ligne de données se lit : en-têtes, aucune ligne", async () => {
    const fichier = await classeur((feuille) => feuille.addRow(["Référence"]));
    const lecture = await lireFichier(fichier);
    expect(lecture.entetes).toEqual(["Référence"]);
    expect(lecture.lignes).toEqual([]);
  });

  describe("bombe de décompression : le plafond de 10 Mo porte sur le fichier compressé, pas sur ce qu'il devient en mémoire", () => {
    const MESSAGE = /décompress.*découper|découper.*décompress/s;

    it("un classeur qui dépasse la borne une fois décompressé est refusé avant d'être chargé, même s'il pèse peu (audit du 2026-11-09)", async () => {
      const archive = await classeurValide();
      archive.file("xl/worksheets/sheet1.xml", new Uint8Array(OCTETS_DECOMPRESSES_MAX + 1));
      const fichier = await compresser(archive);
      expect(fichier.length).toBeLessThan(OCTETS_MAX);
      await expect(lireFichier(fichier)).rejects.toBeInstanceOf(ErreurFichier);
      await expect(lireFichier(fichier)).rejects.toThrow(MESSAGE);
    }, 60_000);

    it("une feuille secondaire énorme, que la brique ne lirait jamais, compte aussi : toutes les entrées de l'archive sont chargées", async () => {
      const archive = await classeurValide();
      archive.file("xl/worksheets/sheet2.xml", new Uint8Array(OCTETS_DECOMPRESSES_MAX + 1));
      await expect(lireFichier(await compresser(archive))).rejects.toThrow(MESSAGE);
    }, 60_000);

    it("la borne tient quand le fichier ment sur sa taille décompressée : c'est le flux réel qui est compté", async () => {
      const archive = await classeurValide();
      archive.file("xl/worksheets/sheet2.xml", new Uint8Array(OCTETS_DECOMPRESSES_MAX + 1));
      const bombe = await compresser(archive);
      await expect(lireFichier(annoncerTaille(bombe, 1024))).rejects.toThrow(MESSAGE);
    }, 60_000);

    it("la somme de plusieurs entrées moyennes compte, pas seulement chaque entrée", async () => {
      const archive = await classeurValide();
      const quart = new Uint8Array(Math.ceil(OCTETS_DECOMPRESSES_MAX / 4) + 1);
      for (const nom of ["a", "b", "c", "d"]) archive.file(`xl/media/${nom}.bin`, quart);
      await expect(lireFichier(await compresser(archive))).rejects.toThrow(MESSAGE);
    }, 60_000);
  });
});
