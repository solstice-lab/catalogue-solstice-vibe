import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { supprimerTousLesComptes } from "./aide-comptes";
import { query, queryOne, transaction } from "../src/lib/db/client";
import { anonymiserLeCompte, desactiver, reactiver } from "../src/briques/comptes/administration";
import type { CompteTouche, Effet, EffetsDeCompte, EvenementDeCompte } from "../src/briques/comptes/effets";
import type { ContexteEntree } from "../src/briques/comptes/entree";

/*
 * Le registre des effets de comptes (src/config/effets-comptes.ts) : ce que
 * les autres unités font quand un compte est désactivé, réactivé ou effacé.
 * Né de l'essai tours-de-coloc (2026-11-03), où terminer une appartenance à la
 * désactivation obligeait à retoucher src/app/comptes/actions.ts, un fichier
 * de la brique gestion-comptes.
 *
 * Les gestes se jouent ici par les fonctions de la brique, comme les appellent
 * les actions de /comptes et l'effacement de la brique rgpd ; le registre lu
 * par les gestes est celui de chaque test (etat.registre).
 */

const EVENEMENTS: EvenementDeCompte[] = ["desactivation", "reactivation", "effacement"];

const etat = vi.hoisted(() => ({
  // Le registre tel que les gestes le lisent : chaque test y met ses entrées.
  registre: [] as EffetsDeCompte[],
  // Le vrai registre de l'appli, pour le verrou.
  vrai: [] as EffetsDeCompte[],
  // Vrai pendant qu'un effet se joue : le pool refuse alors toute requête.
  dansUnEffet: false,
}));

vi.mock("../src/config/effets-comptes", async (original) => {
  const vrai = await original<typeof import("../src/config/effets-comptes")>();
  etat.vrai = vrai.EFFETS_COMPTES;
  return { EFFETS_COMPTES: etat.registre };
});

// Le pool de la base, gardé : appelé pendant un effet, il lève au lieu de
// répondre. Sans cette garde, l'écriture fautive du verrou attendrait la ligne
// que la transaction du geste tient, et le geste ne finirait jamais.
vi.mock("../src/lib/db/client", async (original) => {
  const vrai = await original<typeof import("../src/lib/db/client")>();
  const garder =
    <A extends unknown[], R>(nom: string, fonction: (...args: A) => R) =>
    (...args: A): R => {
      if (etat.dansUnEffet) {
        throw new Error(`${nom}() appelé pendant un effet : hors de la transaction du geste`);
      }
      return fonction(...args);
    };
  return {
    ...vrai,
    query: garder("query", vrai.query),
    queryOne: garder("queryOne", vrai.queryOne),
    transaction: garder("transaction", vrai.transaction),
  };
});

const SANS_ENTREE: ContexteEntree = { entree: { adresses: {}, domaines: [] }, premierAdmin: undefined, demo: false };
const AUTEUR = { email: "auteur@client.example" };
const TOUCHE = "touche@client.example";

// Géré par l'appli : son rôle en base fait foi, sans configuration à écrire.
async function compte(email: string, role: string, actif = true): Promise<number> {
  const ligne = await queryOne<{ id: number }>(
    "INSERT INTO utilisateurs (email, role, actif, gere_par_l_appli) VALUES ($1, $2, $3, true) RETURNING id",
    [email, role, actif]
  );
  return ligne!.id;
}

const anonymiser = (email: string) => transaction((tx) => anonymiserLeCompte(tx, email, AUTEUR, SANS_ENTREE));

function registre(...entrees: EffetsDeCompte[]): void {
  etat.registre.splice(0, etat.registre.length, ...entrees);
}

// Une entrée qui note ce qu'elle reçoit, et ce qu'elle lit du compte par la
// transaction du geste.
function temoin(unite: string, notes: unknown[]): EffetsDeCompte {
  const noter =
    (evenement: EvenementDeCompte): Effet =>
    async (tx, touche) => {
      const [lu] = await tx.query("SELECT email, actif FROM utilisateurs WHERE id = $1", [touche.id]);
      notes.push({ unite, evenement, touche, lu });
    };
  return {
    unite,
    desactivation: noter("desactivation"),
    reactivation: noter("reactivation"),
    effacement: noter("effacement"),
  };
}

// Chaque effet de l'entrée, joué sous la garde du pool, et noté quand il part.
function sousGarde(effets: EffetsDeCompte, joues: string[]): EffetsDeCompte {
  const garde: EffetsDeCompte = { unite: effets.unite };
  for (const evenement of EVENEMENTS) {
    const effet = effets[evenement];
    if (!effet) continue;
    garde[evenement] = async (tx, touche) => {
      joues.push(`${effets.unite} : ${evenement}`);
      etat.dansUnEffet = true;
      try {
        await effet(tx, touche);
      } finally {
        etat.dansUnEffet = false;
      }
    };
  }
  return garde;
}

const POOL = ["query", "queryOne", "transaction"];

// Les noms du pool qu'un source importe du client de base, hors import de type.
function importsDuPool(source: string): string[] {
  const motif = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']*lib\/db\/client)["']/g;
  return [...source.matchAll(motif)]
    .filter((correspondance) => !correspondance[1])
    .flatMap((correspondance) => correspondance[2].split(","))
    .map((nom) => nom.trim())
    .filter((nom) => !nom.startsWith("type "))
    .map((nom) => nom.split(/\s+as\s+/)[0])
    .filter((nom) => POOL.includes(nom));
}

// Les fichiers dont le registre de l'appli importe ses entrées, hors types.
function fichiersDEffets(): string[] {
  const registre = fs.readFileSync(path.join(process.cwd(), "src", "config", "effets-comptes.ts"), "utf-8");
  return [...registre.matchAll(/^import\s+(?!type\s)[^;]*?from\s*"@\/([^"]+)";/gm)].map((correspondance) =>
    path.join(process.cwd(), "src", `${correspondance[1]}.ts`)
  );
}

// Le verrou : les trois gestes, chacun sur un compte qu'il change vraiment,
// avec ces entrées au registre sous la garde du pool. Rend les effets partis
// et les gestes en échec, avec leur raison.
async function jouerSousGarde(entrees: EffetsDeCompte[]): Promise<{ joues: string[]; fautes: string[] }> {
  const joues: string[] = [];
  const fautes: string[] = [];
  registre(...entrees.map((effets) => sousGarde(effets, joues)));
  const id = await compte(TOUCHE, "membre");
  const essayer = async (evenement: EvenementDeCompte, geste: () => Promise<unknown>) => {
    try {
      const issue = await geste();
      if (issue && typeof issue === "object" && "erreur" in issue)
        fautes.push(`${evenement} : refusé, ${issue.erreur}`);
    } catch (erreur) {
      fautes.push(`${evenement} : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  await essayer("desactivation", () => desactiver(id, AUTEUR, SANS_ENTREE));
  await query("UPDATE utilisateurs SET actif = false WHERE id = $1", [id]);
  await essayer("reactivation", () => reactiver(id, AUTEUR));
  await essayer("effacement", () => anonymiser(TOUCHE));
  return { joues, fautes };
}

// L'auteur est un admin en base, comme en vrai : la brique journal, quand
// elle est au registre, exige un compte à l'auteur de chaque ligne.
async function vider(): Promise<void> {
  await supprimerTousLesComptes();
  await query("DELETE FROM domaines_admis");
}

beforeEach(async () => {
  registre();
  await vider();
  await compte(AUTEUR.email, "admin");
});
afterAll(vider);

describe("verrou : un effet du registre se joue dans la transaction du geste (tours-de-coloc)", () => {
  it("chaque effet du registre de l'appli écrit et lit par la transaction reçue, jamais par le pool", async () => {
    const { joues, fautes } = await jouerSousGarde(etat.vrai);
    expect(fautes).toEqual([]);
    // Chaque effet déclaré est parti : un effet jamais joué passerait le
    // verrou sans rien vérifier.
    expect(joues).toEqual(
      EVENEMENTS.flatMap((evenement) =>
        etat.vrai.filter((effets) => effets[evenement]).map((effets) => `${effets.unite} : ${evenement}`)
      )
    );
  });

  it("attrape un effet qui passe par le pool : une écriture par query(), une lecture par queryOne(), une transaction à lui (cas fautif)", async () => {
    const fautif: EffetsDeCompte = {
      unite: "fautif",
      desactivation: async (_tx, { id }) => {
        await query("UPDATE utilisateurs SET role = role WHERE id = $1", [id]);
      },
      // Ce que la transaction reçue lit passe ; la lecture suivante, par le
      // pool, non.
      reactivation: async (tx, { id }) => {
        await tx.query("SELECT 1 FROM utilisateurs WHERE id = $1", [id]);
        await queryOne("SELECT 1 FROM utilisateurs WHERE id = $1", [id]);
      },
      effacement: async () => {
        await transaction(async () => undefined);
      },
    };
    const { joues, fautes } = await jouerSousGarde([fautif]);
    expect(joues).toEqual(["fautif : desactivation", "fautif : reactivation", "fautif : effacement"]);
    expect(fautes).toEqual([
      expect.stringMatching(/^desactivation : query\(\) appelé pendant un effet/),
      expect.stringMatching(/^reactivation : queryOne\(\) appelé pendant un effet/),
      expect.stringMatching(/^effacement : transaction\(\) appelé pendant un effet/),
    ]);
  });

  // Le jeu ci-dessus ne voit que les branches qu'un compte « membre » sans rien
  // autour fait parcourir : un effet qui ne passerait par le pool que dans un
  // cas rare (nommer un autre gestionnaire) lui échapperait. Le fichier qui
  // déclare les effets d'une unité n'importe donc pas le pool.
  it("aucun fichier d'effets du registre n'importe query, queryOne ni transaction du client de base", () => {
    const fichiers = fichiersDEffets();
    const fautifs = fichiers.flatMap((fichier) =>
      importsDuPool(fs.readFileSync(fichier, "utf-8")).map(
        (nom) => `${path.relative(process.cwd(), fichier)} importe « ${nom} »`
      )
    );
    expect(fautifs).toEqual([]);
    // Chaque entrée du registre vient d'un fichier lu ici.
    expect(fichiers).toHaveLength(etat.vrai.length);
  });

  it("attrape un fichier d'effets qui importe le pool, et laisse passer le type de l'exécuteur (cas fautif)", () => {
    const source = [
      `import { query, type ExecuteurSql } from "@/lib/db/client";`,
      `import {`,
      `  queryOne,`,
      `  transaction as ouvrir,`,
      `} from "../../lib/db/client";`,
      `import type { transaction } from "@/lib/db/client";`,
      `import { journaliser } from "./journal";`,
    ].join("\n");
    expect(importsDuPool(source)).toEqual(["query", "queryOne", "transaction"]);
  });
});

describe("les effets d'une désactivation, d'une réactivation, d'un effacement", () => {
  it("voient le geste fait, par la transaction, et reçoivent son auteur et le geste à tracer, sans l'adresse", async () => {
    const notes: unknown[] = [];
    registre(temoin("module", notes));
    const id = await compte(TOUCHE, "membre");

    expect(await desactiver(id, AUTEUR, SANS_ENTREE)).toBeUndefined();
    expect(await reactiver(id, AUTEUR)).toBeUndefined();
    expect(await anonymiser(TOUCHE)).toMatchObject({ id });

    const geste = (champs: string[]): CompteTouche["geste"] => ({
      action: "modification",
      entite: "compte",
      entiteId: id,
      libelle: `compte n°${id}`,
      champs,
    });
    expect(notes).toEqual([
      {
        unite: "module",
        evenement: "desactivation",
        touche: { id, auteur: AUTEUR, geste: geste(["actif"]) },
        lu: { email: TOUCHE, actif: false },
      },
      {
        unite: "module",
        evenement: "reactivation",
        touche: { id, auteur: AUTEUR, geste: geste(["actif"]) },
        lu: { email: TOUCHE, actif: true },
      },
      {
        unite: "module",
        evenement: "effacement",
        touche: { id, auteur: AUTEUR, geste: geste(["email", "actif", "gere_par_l_appli"]) },
        lu: { email: `efface-${id}@efface.invalid`, actif: false },
      },
    ]);
    expect(JSON.stringify(notes.map((note) => (note as { touche: unknown }).touche))).not.toContain(TOUCHE);
  });

  it("se jouent dans l'ordre du registre", async () => {
    const notes: { unite: string }[] = [];
    registre(temoin("premier", notes), temoin("second", notes));
    const id = await compte(TOUCHE, "membre");
    await desactiver(id, AUTEUR, SANS_ENTREE);
    expect(notes.map((note) => note.unite)).toEqual(["premier", "second"]);
  });

  // Comme une trace : l'effet et le geste se font ensemble ou pas du tout. Le
  // premier effet écrit, le second lève : rien ne reste, ni de l'un ni du geste.
  it("annulent le geste quand l'un d'eux lève, avec ce que les effets d'avant ont écrit", async () => {
    const ecrire: Effet = async (tx) => {
      await tx.query("INSERT INTO domaines_admis (domaine) VALUES ('effet.example')");
    };
    const lever: Effet = async () => {
      throw new Error("effet en échec");
    };
    registre(
      { unite: "ecrit", desactivation: ecrire, reactivation: ecrire, effacement: ecrire },
      { unite: "leve", desactivation: lever, reactivation: lever, effacement: lever }
    );
    const id = await compte(TOUCHE, "membre");
    const etatDuCompte = () => queryOne("SELECT email, actif FROM utilisateurs WHERE id = $1", [id]);

    await expect(desactiver(id, AUTEUR, SANS_ENTREE)).rejects.toThrow("effet en échec");
    expect(await etatDuCompte()).toEqual({ email: TOUCHE, actif: true });

    await query("UPDATE utilisateurs SET actif = false WHERE id = $1", [id]);
    await expect(reactiver(id, AUTEUR)).rejects.toThrow("effet en échec");
    expect(await etatDuCompte()).toEqual({ email: TOUCHE, actif: false });

    await expect(anonymiser(TOUCHE)).rejects.toThrow("effet en échec");
    expect(await etatDuCompte()).toEqual({ email: TOUCHE, actif: false });

    expect(await query("SELECT domaine FROM domaines_admis")).toEqual([]);
  });

  it("ne partent pas pour un geste refusé ni pour un geste qui ne change rien", async () => {
    const notes: unknown[] = [];
    registre(temoin("module", notes));
    await query("DELETE FROM utilisateurs WHERE email = $1", [AUTEUR.email]);
    const seul = await compte("seul.admin@client.example", "admin");
    const actif = await compte(TOUCHE, "membre");
    const desactive = await compte("desactive@client.example", "membre", false);

    expect(await desactiver(seul, AUTEUR, SANS_ENTREE)).toHaveProperty("erreur");
    expect(await anonymiser("seul.admin@client.example")).toHaveProperty("erreur");
    expect(await reactiver(actif, AUTEUR)).toBeUndefined();
    expect(await desactiver(desactive, AUTEUR, SANS_ENTREE)).toBeUndefined();
    expect(await anonymiser("inconnue@client.example")).toBeNull();
    expect(notes).toEqual([]);
  });
});
