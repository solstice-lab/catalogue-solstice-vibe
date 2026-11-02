import { describe, expect, it } from "vitest";
import { reconnaitreFormat } from "../src/briques/import-lot/format";

const octets = (texte: string) => new TextEncoder().encode(texte);

describe("format d'un fichier d'import (reconnu au contenu, jamais à l'extension)", () => {
  it("un xlsx se reconnaît à sa signature zip, quel que soit son nom (un fichier renommé ne doit pas faire échouer l'import)", () => {
    const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    expect(reconnaitreFormat(zip)).toBe("xlsx");
  });

  it("un CSV se reconnaît à son contenu texte, même s'il porte le nom d'un .xlsx", () => {
    expect(reconnaitreFormat(octets("reference;date\nA1;05/06/2026\n"))).toBe("csv");
  });

  it("un ancien .xls (signature OLE) est reconnu comme tel, pour être refusé clairement et non lu de travers", () => {
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(reconnaitreFormat(ole)).toBe("xls");
  });

  it("un binaire quelconque est inconnu, jamais pris pour un CSV", () => {
    expect(reconnaitreFormat(Uint8Array.from([0x00, 0x01, 0x02, 0xff, 0x00, 0x10]))).toBe("inconnu");
  });

  it("un fichier vide est inconnu", () => {
    expect(reconnaitreFormat(new Uint8Array())).toBe("inconnu");
  });
});
