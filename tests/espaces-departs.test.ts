import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { query, queryOne, transaction } from "../src/lib/db/client";
import { ESPACES } from "../src/config/espaces";
import { anonymiserLeCompte, desactiver, reactiver } from "../src/briques/comptes/administration";
import type { ContexteEntree } from "../src/briques/comptes/entree";
import type { DepartDEspace, EffetDeDepart, EffetsDeDepart } from "../src/briques/espaces/departs";
import { creerEspace, quitter, rejoindre, retirerMembre } from "../src/briques/espaces/espaces";
import { adhesionDe, compte, personne, repartirDeZero } from "./aide-espaces";

/*
 * Le registre des effets d'un départ d'espace (src/config/effets-espaces.ts) :
 * ce que les modules font quand un membre quitte un espace, en est retiré, ou
 * que son compte est désactivé ou effacé. Né du réassemblage de tours-de-coloc
 * (2026-11-03) : quitter et retirer un membre ne prévenaient personne, et
 * chaque module (l'ordre des tours, les tours futurs, les échanges en attente)
 * devait sauter les adhésions terminées à la lecture, au risque d'en oublier.
 *
 * Les gestes se jouent ici par les fonctions des briques, comme les appellent
 * les server actions de /espace, celles de /comptes et l'effacement de la
 * brique rgpd ; le registre lu par les gestes est celui de chaque test
 * (etat.registre).
 */

const etat = vi.hoisted(() => ({
  // Le registre tel que les gestes le lisent : chaque test y met ses entrées.
  registre: [] as EffetsDeDepart[],
  // Le vrai registre de l'appli, pour le verrou.
  vrai: [] as EffetsDeDepart[],
  // Vrai pendant qu'un effet se joue : le pool refuse alors toute requête.
  dansUnEffet: false,
}));

vi.mock("../src/config/effets-espaces", async (original) => {
  const vrai = await original<typeof import("../src/config/effets-espaces")>();
  etat.vrai = vrai.EFFETS_DEPARTS;
  return { EFFETS_DEPARTS: etat.registre };
});

// Le pool de la base, gardé : appelé pendant un effet, il lève au lieu de
// répondre. Sans cette garde, une écriture fautive attendrait la ligne de
// l'espace que la transaction du geste tient, et le geste ne finirait jamais.
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
const ADMIN = { email: "admin@client.example" };
const ALICE = "alice@coloc.example";
const BRUNO = "bruno@coloc.example";
const CHLOE = "chloe@coloc.example";
const DAVID = "david@coloc.example";

let ids: Record<string, number>;

beforeEach(async () => {
  registre();
  await repartirDeZero();
  ids = {};
  for (const email of [ALICE, BRUNO, CHLOE, DAVID]) ids[email] = await compte(email);
  // L'auteur des gestes de comptes a son compte : avec la brique journal, la
  // trace du geste le retrouve en base.
  await compte(ADMIN.email, "admin");
});

function registre(...entrees: EffetsDeDepart[]): void {
  etat.registre.splice(0, etat.registre.length, ...entrees);
}

// Alice crée l'espace, puis les autres, dans cet ordre, le rejoignent.
async function espace(nom: string, ...autres: string[]): Promise<{ id: number; code: string }> {
  const cree = await creerEspace(personne(ALICE), { nom, prenom: "Alice" });
  if ("erreur" in cree) throw new Error(cree.erreur);
  for (const email of autres) {
    const issue = await rejoindre(personne(email), { code: cree.espace.code, prenom: email.split("@")[0] });
    if ("erreur" in issue) throw new Error(issue.erreur);
  }
  return cree.espace;
}

const desactiverLeCompte = (email: string) => desactiver(ids[email], ADMIN, SANS_ENTREE);
const effacerLeCompte = (email: string) => transaction((tx) => anonymiserLeCompte(tx, email, ADMIN, SANS_ENTREE));

// Une entrée qui note ce qu'elle reçoit, et ce qu'elle lit de l'adhésion par
// la transaction du geste.
function temoin(unite: string, notes: unknown[]): EffetsDeDepart {
  return {
    unite,
    depart: async (tx, depart) => {
      const [lu] = await tx.query(
        "SELECT prenom, role, motif_depart, depart_le IS NOT NULL AS terminee FROM espaces_adhesions WHERE id = $1",
        [depart.adhesionId]
      );
      notes.push({ unite, depart, lu });
    },
  };
}

const lever: EffetDeDepart = async () => {
  throw new Error("effet en échec");
};

const enCours = async (espaceId: number) =>
  (
    await query<{ utilisateur_id: number }>(
      "SELECT utilisateur_id FROM espaces_adhesions WHERE espace_id = $1 AND depart_le IS NULL ORDER BY id",
      [espaceId]
    )
  ).map((ligne) => ligne.utilisateur_id);

describe("les effets d'un départ d'espace", () => {
  it("quitter les joue dans sa transaction, avec le motif « parti », l'espace, le compte et l'adhésion, l'adhésion déjà terminée (tours-de-coloc)", async () => {
    const notes: unknown[] = [];
    registre(temoin("module", notes));
    const { id } = await espace("Coloc des Lilas", BRUNO);
    const bruno = await adhesionDe(id, BRUNO);

    expect(await quitter(personne(BRUNO), id)).toBeUndefined();
    expect(notes).toEqual([
      {
        unite: "module",
        depart: { espaceId: id, utilisateurId: ids[BRUNO], adhesionId: bruno, motif: "parti" },
        lu: { prenom: "bruno", role: "membre", motif_depart: "parti", terminee: true },
      },
    ]);
  });

  it("retirer un membre les joue pour le membre retiré, avec le motif « retire », pas pour le gestionnaire qui retire", async () => {
    const notes: unknown[] = [];
    registre(temoin("module", notes));
    const { id } = await espace("Coloc des Lilas", BRUNO);
    const bruno = await adhesionDe(id, BRUNO);

    expect(await retirerMembre(personne(ALICE), id, bruno)).toBeUndefined();
    expect(notes).toEqual([
      {
        unite: "module",
        depart: { espaceId: id, utilisateurId: ids[BRUNO], adhesionId: bruno, motif: "retire" },
        lu: expect.objectContaining({ motif_depart: "retire", terminee: true }),
      },
    ]);
  });

  it("désactiver un compte les joue pour chacun de ses espaces, avec le motif « compte-desactive », une fois le successeur nommé", async () => {
    ESPACES.plusieursParCompte = true;
    const notes: { depart: DepartDEspace; lu: unknown }[] = [];
    registre(temoin("module", notes));
    const lilas = await espace("Coloc des Lilas", BRUNO);
    const tilleuls = await espace("Coloc des Tilleuls", CHLOE);

    expect(await desactiverLeCompte(ALICE)).toBeUndefined();
    expect(notes.map((note) => note.depart)).toEqual([
      { espaceId: lilas.id, utilisateurId: ids[ALICE], adhesionId: expect.any(Number), motif: "compte-desactive" },
      { espaceId: tilleuls.id, utilisateurId: ids[ALICE], adhesionId: expect.any(Number), motif: "compte-desactive" },
    ]);
    // Le successeur est nommé avant que les modules ne voient le départ.
    const roles = await query<{ role: string }>(
      "SELECT role FROM espaces_adhesions WHERE utilisateur_id = ANY($1) AND depart_le IS NULL ORDER BY espace_id",
      [[ids[BRUNO], ids[CHLOE]]]
    );
    expect(roles.map((ligne) => ligne.role)).toEqual(["gestionnaire", "gestionnaire"]);
  });

  it("effacer un compte actif les joue avec le motif « compte-efface », le prénom déjà remplacé par « Ancien membre »", async () => {
    const notes: unknown[] = [];
    registre(temoin("module", notes));
    const { id } = await espace("Coloc des Lilas", BRUNO);
    const bruno = await adhesionDe(id, BRUNO);

    expect(await effacerLeCompte(BRUNO)).toMatchObject({ id: ids[BRUNO] });
    expect(notes).toEqual([
      {
        unite: "module",
        depart: { espaceId: id, utilisateurId: ids[BRUNO], adhesionId: bruno, motif: "compte-efface" },
        lu: expect.objectContaining({ prenom: "Ancien membre", terminee: true }),
      },
    ]);
  });

  it("se jouent dans l'ordre du registre", async () => {
    const notes: { unite: string }[] = [];
    registre(temoin("premier", notes), temoin("second", notes));
    const { id } = await espace("Coloc des Lilas", BRUNO);
    await quitter(personne(BRUNO), id);
    expect(notes.map((note) => note.unite)).toEqual(["premier", "second"]);
  });

  // Comme pour les effets de comptes : le départ et ses effets se font
  // ensemble ou pas du tout. Le premier effet écrit, le second lève : rien ne
  // reste, ni de l'un ni du geste.
  it("annulent le geste quand l'un d'eux lève, avec ce que les effets d'avant ont écrit", async () => {
    const ecrire: EffetDeDepart = async (tx, { espaceId }) => {
      await tx.query("UPDATE espaces SET nom = 'Écrit par un effet' WHERE id = $1", [espaceId]);
    };
    registre({ unite: "ecrit", depart: ecrire }, { unite: "leve", depart: lever });
    const { id } = await espace("Coloc des Lilas", BRUNO, CHLOE, DAVID);
    const presents = [ids[ALICE], ids[BRUNO], ids[CHLOE], ids[DAVID]];

    await expect(quitter(personne(BRUNO), id)).rejects.toThrow("effet en échec");
    await expect(retirerMembre(personne(ALICE), id, await adhesionDe(id, CHLOE))).rejects.toThrow("effet en échec");
    await expect(desactiverLeCompte(DAVID)).rejects.toThrow("effet en échec");
    await expect(effacerLeCompte(DAVID)).rejects.toThrow("effet en échec");

    expect(await enCours(id)).toEqual(presents);
    expect(await queryOne("SELECT nom FROM espaces WHERE id = $1", [id])).toEqual({ nom: "Coloc des Lilas" });
    expect(await queryOne("SELECT email, actif FROM utilisateurs WHERE id = $1", [ids[DAVID]])).toEqual({
      email: DAVID,
      actif: true,
    });
  });

  it("ne partent pas pour un geste refusé, ni pour une adhésion déjà terminée, ni à la réactivation", async () => {
    const notes: unknown[] = [];
    const { id } = await espace("Coloc des Lilas", BRUNO, CHLOE);
    await desactiverLeCompte(CHLOE);
    registre(temoin("module", notes));

    // Le dernier gestionnaire ne part pas, un membre ne retire personne.
    expect(await quitter(personne(ALICE), id)).toHaveProperty("erreur");
    expect(await retirerMembre(personne(BRUNO), id, await adhesionDe(id, ALICE))).toHaveProperty("erreur");
    // Chloé est partie à la désactivation : ni la réactivation ni l'effacement
    // ne rejouent ce départ.
    expect(await reactiver(ids[CHLOE], ADMIN)).toBeUndefined();
    expect(await effacerLeCompte(CHLOE)).toMatchObject({ id: ids[CHLOE] });
    expect(notes).toEqual([]);
  });

  // Un module qui recalcule l'ordre des tours lit les membres présents : une
  // arrivée jouée pendant l'effet le fausserait.
  it("se jouent sous le verrou de l'espace : une arrivée dans le même espace attend leur fin", async () => {
    const ordre: string[] = [];
    let commence: () => void = () => undefined;
    const effetCommence = new Promise<void>((fin) => (commence = fin));
    registre({
      unite: "lent",
      depart: async () => {
        ordre.push("effet : début");
        commence();
        await new Promise((fin) => setTimeout(fin, 300));
        ordre.push("effet : fin");
      },
    });
    const { id, code } = await espace("Coloc des Lilas", BRUNO);
    const depart = quitter(personne(BRUNO), id);
    await effetCommence;
    const arrivee = rejoindre(personne(CHLOE), { code, prenom: "Chloé" }).then((issue) => {
      ordre.push("arrivée");
      return issue;
    });
    await Promise.all([depart, arrivee]);
    expect(ordre).toEqual(["effet : début", "effet : fin", "arrivée"]);
  });
});

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

const REGISTRE = path.join("src", "config", "effets-espaces.ts");

// Les fichiers dont un registre importe ses entrées, hors types.
function fichiersImportes(source: string): string[] {
  return [...source.matchAll(/^import\s+(?!type\s)[^;]*?from\s*"@\/([^"]+)";/gm)].map((correspondance) =>
    path.join("src", `${correspondance[1]}.ts`)
  );
}

// Le registre lui-même, qui peut écrire un effet en ligne, puis les fichiers
// dont il importe ses entrées.
function fichiersDEffets(): string[] {
  return [REGISTRE, ...fichiersImportes(fs.readFileSync(path.join(process.cwd(), REGISTRE), "utf-8"))];
}

// Le verrou : les quatre départs, chacun sur un membre différent, avec ces
// entrées au registre sous la garde du pool. Rend les effets partis et les
// gestes en échec, avec leur raison.
async function jouerSousGarde(entrees: EffetsDeDepart[]): Promise<{ joues: string[]; fautes: string[] }> {
  const joues: string[] = [];
  const fautes: string[] = [];
  const { id } = await espace("Coloc des Lilas", BRUNO, CHLOE, DAVID);
  const chloe = await adhesionDe(id, CHLOE);
  // Une personne de plus, qu'on effacera.
  const eve = "eve@coloc.example";
  ids[eve] = await compte(eve);
  const { code } = (await queryOne<{ code: string }>("SELECT code FROM espaces WHERE id = $1", [id]))!;
  await rejoindre(personne(eve), { code, prenom: "Eve" });

  registre(
    ...entrees.map((effets): EffetsDeDepart => ({
      unite: effets.unite,
      depart: async (tx, depart) => {
        joues.push(`${effets.unite} : ${depart.motif}`);
        etat.dansUnEffet = true;
        try {
          await effets.depart(tx, depart);
        } finally {
          etat.dansUnEffet = false;
        }
      },
    }))
  );
  const essayer = async (geste: string, faire: () => Promise<unknown>) => {
    try {
      const issue = await faire();
      if (issue && typeof issue === "object" && "erreur" in issue) fautes.push(`${geste} : refusé, ${issue.erreur}`);
    } catch (erreur) {
      fautes.push(`${geste} : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  await essayer("parti", () => quitter(personne(BRUNO), id));
  await essayer("retire", () => retirerMembre(personne(ALICE), id, chloe));
  await essayer("compte-desactive", () => desactiverLeCompte(DAVID));
  await essayer("compte-efface", () => effacerLeCompte(eve));
  return { joues, fautes };
}

const MOTIFS = ["parti", "retire", "compte-desactive", "compte-efface"];

// Une entrée sans faute, ajoutée au vrai registre : vide dans le catalogue, il
// ne ferait rien partir, et le verrou passerait sans prouver que les gestes
// jouent le registre (docs/cicatrices.md, T5).
const SANS_FAUTE: EffetsDeDepart = {
  unite: "sans-faute",
  depart: async (tx, { adhesionId }) => {
    await tx.query("SELECT 1 FROM espaces_adhesions WHERE id = $1", [adhesionId]);
  },
};

describe("verrou : un effet de départ se joue dans la transaction du geste (tours-de-coloc)", () => {
  it("chaque effet du registre de l'appli écrit et lit par la transaction reçue, jamais par le pool", async () => {
    const entrees = [...etat.vrai, SANS_FAUTE];
    const { joues, fautes } = await jouerSousGarde(entrees);
    expect(fautes).toEqual([]);
    // Chaque effet déclaré est parti, à chaque départ : un effet jamais joué
    // passerait le verrou sans rien vérifier.
    expect(joues).toEqual(MOTIFS.flatMap((motif) => entrees.map((effets) => `${effets.unite} : ${motif}`)));
  });

  it("attrape un effet qui passe par le pool : une écriture par query(), une lecture par queryOne(), une transaction à lui (cas fautif)", async () => {
    const fautif: EffetsDeDepart = {
      unite: "fautif",
      depart: async (tx, { motif, espaceId }) => {
        if (motif === "parti") await query("UPDATE espaces SET nom = nom WHERE id = $1", [espaceId]);
        if (motif === "retire") {
          // Ce que la transaction reçue lit passe ; la lecture suivante, par
          // le pool, non.
          await tx.query("SELECT 1 FROM espaces WHERE id = $1", [espaceId]);
          await queryOne("SELECT 1 FROM espaces WHERE id = $1", [espaceId]);
        }
        if (motif === "compte-desactive" || motif === "compte-efface") await transaction(async () => undefined);
      },
    };
    const { joues, fautes } = await jouerSousGarde([fautif]);
    expect(joues).toEqual(MOTIFS.map((motif) => `fautif : ${motif}`));
    expect(fautes).toEqual([
      expect.stringMatching(/^parti : query\(\) appelé pendant un effet/),
      expect.stringMatching(/^retire : queryOne\(\) appelé pendant un effet/),
      expect.stringMatching(/^compte-desactive : transaction\(\) appelé pendant un effet/),
      expect.stringMatching(/^compte-efface : transaction\(\) appelé pendant un effet/),
    ]);
  });

  // Le jeu ci-dessus ne voit que les branches que ces quatre départs font
  // parcourir : un effet qui ne passerait par le pool que dans un cas rare lui
  // échapperait. Le registre et les fichiers qui déclarent ses entrées
  // n'importent donc pas le pool.
  it("ni le registre ni aucun fichier d'effets qu'il importe n'importe query, queryOne ni transaction du client de base", () => {
    const fichiers = fichiersDEffets();
    const fautifs = fichiers.flatMap((fichier) =>
      importsDuPool(fs.readFileSync(path.join(process.cwd(), fichier), "utf-8")).map(
        (nom) => `${fichier} importe « ${nom} »`
      )
    );
    expect(fautifs).toEqual([]);
    // Le registre est lu, et chacune de ses entrées vient d'un fichier lu ici :
    // un verrou qui ne lit rien passerait au vert (docs/cicatrices.md, T5).
    expect(fichiers).toHaveLength(etat.vrai.length + 1);
  });

  it("attrape un registre qui importe une entrée, et un fichier d'effets qui importe le pool, en laissant passer le type de l'exécuteur (cas fautif)", () => {
    const registreAssemble = [
      `import type { EffetsDeDepart } from "@/briques/espaces/departs";`,
      `import { DEPART_TACHES } from "@/lib/taches/effets-espaces";`,
      `import {`,
      `  DEPART_ECHANGES,`,
      `} from "@/lib/echanges/effets-espaces";`,
    ].join("\n");
    expect(fichiersImportes(registreAssemble)).toEqual([
      path.join("src", "lib", "taches", "effets-espaces.ts"),
      path.join("src", "lib", "echanges", "effets-espaces.ts"),
    ]);
    const source = [
      `import { query, type ExecuteurSql } from "@/lib/db/client";`,
      `import {`,
      `  queryOne,`,
      `  transaction as ouvrir,`,
      `} from "../../lib/db/client";`,
      `import type { transaction } from "@/lib/db/client";`,
    ].join("\n");
    expect(importsDuPool(source)).toEqual(["query", "queryOne", "transaction"]);
  });
});
