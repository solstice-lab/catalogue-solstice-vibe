import fs from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * La marque de l'en-tête se remplace dans le thème (src/ui/theme/Marque.tsx),
 * sans toucher aux composants : le logo d'un client, ou rien. Avant, l'emblème
 * Solstice Lab était écrit dans AppLayout et PageVitrine, et le changer
 * obligeait à retoucher le kit. Seuls le thème et la signature de l'agence
 * (PiedDePage, qui la garde quel que soit le thème) importent l'emblème.
 */

const SRC = path.join(process.cwd(), "src");
const PERMIS = new Set(["ui/theme/Marque.tsx", "ui/PiedDePage.tsx", "ui/Embleme.tsx"]);
const IMPORT_DE_L_EMBLEME = /from\s+["'][^"']*\/Embleme["']/;

function sources(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return sources(chemin);
    return /\.tsx?$/.test(entree.name) ? [chemin] : [];
  });
}

function importateursDeLEmbleme(fichiers: { chemin: string; contenu: string }[]): string[] {
  return fichiers
    .filter(({ chemin, contenu }) => !PERMIS.has(chemin) && IMPORT_DE_L_EMBLEME.test(contenu))
    .map(({ chemin }) => chemin);
}

describe("marque de l'en-tête : dans le thème, pas dans les composants", () => {
  it("aucun fichier de src/ hors du thème et de la signature n'importe l'emblème directement", () => {
    const fichiers = sources(SRC).map((chemin) => ({
      chemin: path.relative(SRC, chemin).split(path.sep).join("/"),
      contenu: fs.readFileSync(chemin, "utf-8"),
    }));
    expect(fichiers.length).toBeGreaterThan(0);
    expect(importateursDeLEmbleme(fichiers)).toEqual([]);
  });

  it("attrape un squelette qui importerait l'emblème, et laisse passer le thème et la signature", () => {
    expect(
      importateursDeLEmbleme([
        { chemin: "ui/AppLayout.tsx", contenu: 'import { Embleme } from "./Embleme";' },
        { chemin: "app/page.tsx", contenu: "import { Embleme } from '@/ui/Embleme';" },
        { chemin: "ui/theme/Marque.tsx", contenu: 'import { Embleme } from "../Embleme";' },
        { chemin: "ui/PiedDePage.tsx", contenu: 'import { Embleme } from "./Embleme";' },
        { chemin: "ui/Badge.tsx", contenu: 'import { EmblemeClient } from "./EmblemeClient";' },
      ])
    ).toEqual(["ui/AppLayout.tsx", "app/page.tsx"]);
  });
});

describe("marque de l'en-tête : sans marque, pas de cellule", () => {
  afterEach(() => {
    vi.doUnmock("@/ui/theme/Marque");
    vi.resetModules();
  });

  // Le lien de la marque est le seul de l'en-tête d'AppLayout qui mène à
  // l'accueil quand aucune entrée de menu n'y mène : sa présence dit celle de
  // la cellule. Dans PageVitrine, c'est le lien vers l'accueil qui porte la
  // marque, à côté du nom.
  async function rendus(marque: unknown): Promise<{ outil: string; vitrine: string }> {
    vi.resetModules();
    vi.doMock("@/ui/theme/Marque", () => ({ MARQUE: marque }));
    const { AppLayout, PageVitrine } = await import("@/ui");
    const html = (page: ReactElement) => renderToStaticMarkup(page);
    return {
      outil: html(AppLayout({ nom: "Outil", children: "Contenu" })),
      vitrine: html(PageVitrine({ nom: "Site", children: "Contenu" })),
    };
  }

  it("pose la marque du thème dans les deux en-têtes, quelle qu'elle soit (un logo client)", async () => {
    const { outil, vitrine } = await rendus("LOGO-CLIENT");
    expect(outil).toContain("LOGO-CLIENT");
    expect(outil).toMatch(/href="\/"[^>]*aria-label="Accueil"|aria-label="Accueil"[^>]*href="\/"/);
    expect(vitrine).toContain("LOGO-CLIENT");
  });

  it("n'affiche ni cellule ni lien de marque quand le thème n'en a pas (null)", async () => {
    const { outil, vitrine } = await rendus(null);
    expect(outil).not.toContain('aria-label="Accueil"');
    expect(outil).not.toContain("sl-entete-marque");
    expect(vitrine).not.toContain("sl-entete-marque");
    // Le nom du site mène toujours à l'accueil.
    expect(vitrine).toMatch(/href="\/"/);
  });
});
