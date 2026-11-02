import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { query, queryOne, transaction } from "../src/lib/db/client";
import type { Branchement } from "../src/briques/validation/branchement";
import { STATUTS } from "../src/briques/validation/cycle";
import { SOURCES_VALIDATION } from "../src/briques/validation/donnees-personnelles";
import {
  ErreurConfirmation,
  ErreurDecision,
  ErreurDroit,
  decider,
  deciderEnLot,
  leverRefus,
  lireGroupes,
  lirePropositions,
  proposer,
} from "../src/briques/validation/propositions";

// La file en base réelle. Les règles de statut seules sont dans
// validation-cycle.test.ts. La base de test est partagée : les types de ce
// fichier portent un préfixe, chaque test nettoie ce qu'il a créé et rien
// d'autre.
const PREFIXE_TYPE = "test_validation";
const TYPE = `${PREFIXE_TYPE}_contact`;
const TABLE_EFFETS = "test_validation_effets";

const MARIE = { email: "marie@solstice-lab.example" };

type Contenu = { nom: string };

// Un branchement de test : l'annuaire est la « source de vérité » que
// l'appariement revérifie, `effets` ce que l'applicateur a fait, dans la
// transaction de l'acceptation.
function brancher(
  options: {
    seuilLot?: number;
    peutDecider?: boolean;
    peutDeciderAsynchrone?: boolean;
    echecApplication?: boolean;
  } = {}
) {
  const annuaire = new Set<string>();
  const appliquer = vi.fn(async (contenu: Record<string, unknown>, tx: { query: typeof query }, decideur?: unknown) => {
    void decideur; // lu par les tests, par appliquer.mock.calls
    await tx.query(`INSERT INTO ${TABLE_EFFETS} (valeur) VALUES ($1)`, [(contenu as Contenu).nom]);
    if (options.echecApplication) throw new Error("l'écriture a échoué");
    annuaire.add((contenu as Contenu).nom);
  });
  const branchement: Branchement = {
    id: "test-validation",
    types: {
      [TYPE]: {
        libelle: "Nouveau contact",
        rendu: (contenu) => (contenu as Contenu).nom,
        reverifier: async (contenu) =>
          annuaire.has((contenu as Contenu).nom)
            ? { valide: false, motif: `${(contenu as Contenu).nom} existe déjà` }
            : { valide: true },
        appliquer,
      },
    },
    groupe: (_type, contenu) => (contenu as Contenu & { source?: string }).source ?? null,
    seuilLot: options.seuilLot ?? 50,
    // Une règle qui relit le rôle en base rend une promesse : la brique
    // l'attend, une promesse n'est jamais un « oui ».
    peutDecider: options.peutDeciderAsynchrone
      ? async () => options.peutDecider ?? true
      : () => options.peutDecider ?? true,
  };
  return { branchement, annuaire, appliquer };
}

async function statutDe(id: number) {
  const ligne = await queryOne<{ statut: string; contenu: Contenu }>(
    `SELECT statut, contenu FROM propositions WHERE id = $1`,
    [id]
  );
  return ligne;
}

async function effets() {
  return (await query<{ valeur: string }>(`SELECT valeur FROM ${TABLE_EFFETS} ORDER BY id`)).map((l) => l.valeur);
}

beforeAll(async () => {
  await query(`CREATE TABLE IF NOT EXISTS ${TABLE_EFFETS} (id SERIAL PRIMARY KEY, valeur TEXT NOT NULL)`);
});

afterEach(async () => {
  await query(`DELETE FROM propositions WHERE type LIKE $1`, [`${PREFIXE_TYPE}%`]);
  await query(`DELETE FROM ${TABLE_EFFETS}`);
});

afterAll(async () => {
  await query(`DROP TABLE IF EXISTS ${TABLE_EFFETS}`);
});

describe("brique validation : la file de propositions", () => {
  it("un refus ne libère pas la clé : le rescan ne ressuscite pas la proposition (projet précédent)", async () => {
    const { branchement } = brancher();
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    await decider(branchement, { id, decision: "refusee", decideur: MARIE });

    // Le rescan repropose la même clé, plusieurs fois.
    const rescan = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });

    expect(rescan).toEqual({ issue: "refusee_existante", id });
    expect((await statutDe(id))?.statut).toBe("refusee");
    const toutes = await lirePropositions(branchement);
    expect(toutes.filter((p) => p.cle === "alice")).toHaveLength(1);
    expect(toutes.filter((p) => p.statut === "en_attente")).toHaveLength(0);
  });

  it("une proposition déjà en attente n'est pas dupliquée par un rescan (index unique partiel, projet précédent)", async () => {
    const { branchement } = brancher();
    const premiere = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    const seconde = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    expect(premiere.issue).toBe("creee");
    expect(seconde).toEqual({ issue: "deja_en_attente", id: premiere.id });
  });

  it("deux rescans simultanés ne créent qu'une proposition (index unique partiel, pas seulement une vérification préalable)", async () => {
    const { branchement } = brancher();
    const resultats = await Promise.all(
      Array.from({ length: 5 }, () => proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } }))
    );
    expect(resultats.filter((r) => r.issue === "creee")).toHaveLength(1);
    expect((await lirePropositions(branchement)).filter((p) => p.cle === "alice")).toHaveLength(1);
  });

  it("un rescan rafraîchit le contenu et le groupe d'une proposition encore en attente, jamais ceux d'une proposition décidée (la personne décidait sur un contenu périmé)", async () => {
    const { branchement } = brancher();
    const { id } = await proposer(branchement, {
      type: TYPE,
      cle: "alice",
      contenu: { nom: "Alice", source: "mars" } as Contenu,
    });

    const rescan = await proposer(branchement, {
      type: TYPE,
      cle: "alice",
      contenu: { nom: "Alice Martin", source: "avril" } as Contenu,
    });

    expect(rescan).toEqual({ issue: "deja_en_attente", id });
    expect(await statutDe(id)).toMatchObject({
      statut: "en_attente",
      contenu: { nom: "Alice Martin", source: "avril" },
    });
    expect((await lirePropositions(branchement)).find((p) => p.id === id)?.groupe).toBe("avril");

    // Acceptée, elle a produit son effet sur ce contenu : un rescan suivant en
    // crée une nouvelle et ne la réécrit pas.
    await decider(branchement, { id, decision: "acceptee", decideur: MARIE });
    const apres = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice Durand" } });
    expect(apres.id).not.toBe(id);
    expect((await statutDe(id))?.contenu).toEqual({ nom: "Alice Martin", source: "avril" });
  });

  it("un contenu absent ou qui n'est pas un objet est refusé avant la base, à la proposition comme à la levée d'un refus (undefined finissait en violation NOT NULL brute)", async () => {
    const { branchement } = brancher();
    for (const contenu of [undefined, null, "Alice", 42, ["Alice"]]) {
      await expect(proposer(branchement, { type: TYPE, cle: "alice", contenu: contenu as never })).rejects.toThrow(
        "Le contenu d'une proposition est un objet."
      );
    }
    expect(await lirePropositions(branchement)).toEqual([]);

    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    await decider(branchement, { id, decision: "refusee", decideur: MARIE });
    for (const contenu of [undefined, ["Alice"]]) {
      await expect(leverRefus(branchement, { id, contenu: contenu as never, decideur: MARIE })).rejects.toBeInstanceOf(
        ErreurDecision
      );
    }
    expect(await statutDe(id)).toEqual({ statut: "refusee", contenu: { nom: "Alice" } });
  });

  it("une proposition acceptée libère sa clé : la source peut en reproposer une (décision de la fiche)", async () => {
    const { branchement } = brancher();
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    await decider(branchement, { id, decision: "acceptee", decideur: MARIE });
    const nouvelle = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    expect(nouvelle.issue).toBe("creee");
    expect(nouvelle.id).not.toBe(id);
  });

  it("lever un refus est un geste humain qui rafraîchit le contenu (projet précédent)", async () => {
    const { branchement } = brancher();
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice ancienne" } });
    await decider(branchement, { id, decision: "refusee", decideur: MARIE });
    // Le rescan voit un contenu plus récent : il ne rafraîchit PAS le refus.
    await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice récente" } });
    expect((await statutDe(id))?.contenu).toEqual({ nom: "Alice ancienne" });

    const levee = await leverRefus(branchement, { id, contenu: { nom: "Alice récente" }, decideur: MARIE });

    expect(levee).toEqual({ issue: "levee" });
    const apres = await statutDe(id);
    expect(apres?.statut).toBe("en_attente");
    expect(apres?.contenu).toEqual({ nom: "Alice récente" });
  });

  it("lever un refus exige un décideur identifié et le droit de décider, et ne touche que les refus", async () => {
    const { branchement } = brancher();
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    // Une proposition en attente n'a pas de refus à lever : rien ne change.
    expect(await leverRefus(branchement, { id, contenu: { nom: "Autre" }, decideur: MARIE })).toEqual({
      issue: "pas_refusee",
      statut: "en_attente",
    });
    expect((await statutDe(id))?.contenu).toEqual({ nom: "Alice" });

    await decider(branchement, { id, decision: "refusee", decideur: MARIE });
    await expect(
      leverRefus(branchement, { id, contenu: { nom: "Autre" }, decideur: undefined as never })
    ).rejects.toBeInstanceOf(ErreurDecision);
    await expect(
      leverRefus(brancher({ peutDecider: false }).branchement, { id, contenu: { nom: "Autre" }, decideur: MARIE })
    ).rejects.toBeInstanceOf(ErreurDroit);
    expect((await statutDe(id))?.statut).toBe("refusee");
  });
});

describe("brique validation : décider", () => {
  it("accepter une proposition ancienne revérifie l'appariement : elle n'est pas appliquée et reste en attente", async () => {
    const { branchement, annuaire, appliquer } = brancher();
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    // Entre la proposition et l'acceptation, le contact a été créé ailleurs.
    annuaire.add("Alice");

    const resultat = await decider(branchement, { id, decision: "acceptee", decideur: MARIE });

    expect(resultat).toEqual({ issue: "obsolete", motif: "Alice existe déjà" });
    expect(appliquer).not.toHaveBeenCalled();
    expect((await statutDe(id))?.statut).toBe("en_attente");
    expect(await effets()).toEqual([]);
  });

  it("accepter applique, trace qui a décidé, et refuser n'applique rien", async () => {
    const { branchement, appliquer } = brancher();
    const acceptee = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    const refusee = await proposer(branchement, { type: TYPE, cle: "bob", contenu: { nom: "Bob" } });

    expect(await decider(branchement, { id: acceptee.id, decision: "acceptee", decideur: MARIE })).toEqual({
      issue: "acceptee",
    });
    expect(await decider(branchement, { id: refusee.id, decision: "refusee", decideur: MARIE })).toEqual({
      issue: "refusee",
    });

    expect(appliquer).toHaveBeenCalledTimes(1);
    expect(await effets()).toEqual(["Alice"]);
    const traces = await query<{ id: number; decide_par: string; decide_le: Date | null }>(
      `SELECT id, decide_par, decide_le FROM propositions WHERE id = ANY($1)`,
      [[acceptee.id, refusee.id]]
    );
    for (const trace of traces) {
      expect(trace.decide_par).toBe(MARIE.email);
      expect(trace.decide_le).not.toBeNull();
    }
  });

  it("décider deux fois la même proposition ne fait rien de plus (une appli livrée : page périmée soumise deux fois)", async () => {
    const { branchement, appliquer } = brancher();
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });
    await decider(branchement, { id, decision: "acceptee", decideur: MARIE });

    const encore = await decider(branchement, { id, decision: "acceptee", decideur: MARIE });
    // Même une décision contraire, soumise depuis une page périmée, ne défait rien.
    const contraire = await decider(branchement, { id, decision: "refusee", decideur: MARIE });

    expect(encore).toEqual({ issue: "deja_decidee", statut: "acceptee" });
    expect(contraire).toEqual({ issue: "deja_decidee", statut: "acceptee" });
    expect(appliquer).toHaveBeenCalledTimes(1);
    expect(await effets()).toEqual(["Alice"]);
    expect((await statutDe(id))?.statut).toBe("acceptee");
  });

  it("une demande ne produit qu'un dépôt : deux acceptations simultanées n'appliquent qu'une fois (Catalogue C10)", async () => {
    const { branchement, appliquer } = brancher();
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });

    const resultats = await Promise.all([
      decider(branchement, { id, decision: "acceptee", decideur: MARIE }),
      decider(branchement, { id, decision: "acceptee", decideur: { email: "paul@solstice-lab.example" } }),
      decider(branchement, { id, decision: "acceptee", decideur: MARIE }),
    ]);

    expect(appliquer).toHaveBeenCalledTimes(1);
    expect(await effets()).toEqual(["Alice"]);
    expect(resultats.filter((r) => r.issue === "acceptee")).toHaveLength(1);
    expect(resultats.filter((r) => r.issue === "deja_decidee")).toHaveLength(2);
  });

  it("peutDecider et l'applicateur reçoivent le décideur avec son rôle, pas un e-mail seul (un peutDecider branché sur peut() de la brique comptes, qui lit role, refusait tout le monde)", async () => {
    const { branchement, appliquer } = brancher();
    branchement.peutDecider = (decideur) => (decideur as { role?: string }).role === "admin";
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });

    const membre = { email: "paul@solstice-lab.example", role: "membre" };
    await expect(decider(branchement, { id, decision: "acceptee", decideur: membre })).rejects.toBeInstanceOf(
      ErreurDroit
    );
    const admin = { email: "  marie@solstice-lab.example ", role: "admin" };
    expect(await decider(branchement, { id, decision: "acceptee", decideur: admin })).toEqual({ issue: "acceptee" });

    // L'e-mail est normalisé, le rôle conservé, jusque dans l'applicateur et la trace.
    expect(appliquer.mock.calls[0][2]).toEqual({ email: "marie@solstice-lab.example", role: "admin" });
    const trace = await queryOne<{ decide_par: string }>(`SELECT decide_par FROM propositions WHERE id = $1`, [id]);
    expect(trace?.decide_par).toBe("marie@solstice-lab.example");
  });

  it("une décision exige un décideur identifié, jamais un jeton à la place : sans décideur identifié, rien n'est décidé (Catalogue C10)", async () => {
    const { branchement, appliquer } = brancher();
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });

    for (const decideur of [undefined, null, {}, { email: "" }, { email: "   " }, "jeton-abc123"]) {
      await expect(
        decider(branchement, { id, decision: "acceptee", decideur: decideur as never })
      ).rejects.toBeInstanceOf(ErreurDecision);
    }

    expect(appliquer).not.toHaveBeenCalled();
    expect((await statutDe(id))?.statut).toBe("en_attente");
  });

  it("une décision vide bloque, jamais prise par défaut (une appli livrée)", async () => {
    const { branchement, appliquer } = brancher();
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });

    for (const decision of [undefined, null, "", " ", "ACCEPTEE", "en_attente", "oui"]) {
      await expect(decider(branchement, { id, decision: decision as never, decideur: MARIE })).rejects.toBeInstanceOf(
        ErreurDecision
      );
    }

    expect(appliquer).not.toHaveBeenCalled();
    expect((await statutDe(id))?.statut).toBe("en_attente");
  });

  it("décider refuse un utilisateur sans droit : rien n'est appliqué ni écrit (CLAUDE.md §3)", async () => {
    const { branchement, appliquer } = brancher({ peutDecider: false });
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });

    await expect(decider(branchement, { id, decision: "acceptee", decideur: MARIE })).rejects.toBeInstanceOf(
      ErreurDroit
    );
    await expect(decider(branchement, { id, decision: "refusee", decideur: MARIE })).rejects.toBeInstanceOf(
      ErreurDroit
    );

    expect(appliquer).not.toHaveBeenCalled();
    expect((await statutDe(id))?.statut).toBe("en_attente");
  });

  it("attend un peutDecider asynchrone qui refuse : rien n'est appliqué ni écrit, ni par décider, ni par lever un refus, ni en lot (le rôle se relira en base)", async () => {
    const { branchement, appliquer } = brancher({ peutDecider: false, peutDeciderAsynchrone: true });
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });

    await expect(decider(branchement, { id, decision: "acceptee", decideur: MARIE })).rejects.toBeInstanceOf(
      ErreurDroit
    );
    await expect(
      deciderEnLot(branchement, { decisions: [{ id, decision: "acceptee" }], decideur: MARIE, confirme: true })
    ).rejects.toBeInstanceOf(ErreurDroit);

    expect(appliquer).not.toHaveBeenCalled();
    expect((await statutDe(id))?.statut).toBe("en_attente");

    const { branchement: ouvert } = brancher({ peutDeciderAsynchrone: true });
    await decider(ouvert, { id, decision: "refusee", decideur: MARIE });
    expect((await statutDe(id))?.statut).toBe("refusee");
    await expect(
      leverRefus(brancher({ peutDecider: false, peutDeciderAsynchrone: true }).branchement, {
        id,
        contenu: { nom: "Autre" },
        decideur: MARIE,
      })
    ).rejects.toBeInstanceOf(ErreurDroit);
    expect((await statutDe(id))?.statut).toBe("refusee");
  });

  it("un applicateur qui échoue laisse la proposition en attente et n'écrit rien : l'applicateur et le statut sont une seule transaction", async () => {
    const { branchement } = brancher({ echecApplication: true });
    const { id } = await proposer(branchement, { type: TYPE, cle: "alice", contenu: { nom: "Alice" } });

    await expect(decider(branchement, { id, decision: "acceptee", decideur: MARIE })).rejects.toThrow(
      "l'écriture a échoué"
    );

    // L'applicateur avait déjà écrit une ligne avant d'échouer : elle est annulée avec le reste.
    expect(await effets()).toEqual([]);
    expect((await statutDe(id))?.statut).toBe("en_attente");
  });

  it("une proposition inconnue est une erreur claire, pas un succès", async () => {
    const { branchement } = brancher();
    await expect(
      decider(branchement, { id: 2_000_000_000, decision: "acceptee", decideur: MARIE })
    ).rejects.toBeInstanceOf(ErreurDecision);
  });
});

describe("brique validation : décider en lot", () => {
  async function proposerN(branchement: Branchement, n: number, groupe?: string) {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const { id } = await proposer(branchement, {
        type: TYPE,
        cle: `personne-${i}`,
        contenu: { nom: `Personne ${i}`, ...(groupe ? { source: groupe } : {}) } as Contenu,
      });
      ids.push(id);
    }
    return ids;
  }

  it("une décision en lot au-delà du seuil exige une confirmation explicite, et rien n'est décidé sans elle", async () => {
    const { branchement, appliquer } = brancher({ seuilLot: 2 });
    const [a, b, c] = await proposerN(branchement, 3);

    // Au seuil, pas de confirmation demandée.
    const auSeuil = await deciderEnLot(branchement, {
      decisions: [
        { id: a, decision: "acceptee" },
        { id: b, decision: "acceptee" },
      ],
      decideur: MARIE,
    });
    expect(auSeuil.map((r) => r.issue)).toEqual(["acceptee", "acceptee"]);

    await expect(
      deciderEnLot(branchement, {
        decisions: [
          { id: c, decision: "refusee" },
          { id: a, decision: "refusee" },
          { id: b, decision: "refusee" },
        ],
        decideur: MARIE,
      })
    ).rejects.toBeInstanceOf(ErreurConfirmation);
    expect((await statutDe(c))?.statut).toBe("en_attente");
    expect(appliquer).toHaveBeenCalledTimes(2);

    const confirme = await deciderEnLot(branchement, {
      decisions: [
        { id: c, decision: "refusee" },
        { id: a, decision: "refusee" },
        { id: b, decision: "refusee" },
      ],
      decideur: MARIE,
      confirme: true,
    });
    expect(confirme.map((r) => r.issue)).toEqual(["refusee", "deja_decidee", "deja_decidee"]);
  });

  it("une proposition obsolète ne bloque pas le reste d'un lot : rapport par proposition (décision de la fiche)", async () => {
    const { branchement, annuaire } = brancher();
    const [a, b, c] = await proposerN(branchement, 3);
    annuaire.add("Personne 1");

    const rapport = await deciderEnLot(branchement, {
      decisions: [a, b, c].map((id) => ({ id, decision: "acceptee" as const })),
      decideur: MARIE,
    });

    expect(rapport.map((r) => r.issue)).toEqual(["acceptee", "obsolete", "acceptee"]);
    expect((await statutDe(a))?.statut).toBe("acceptee");
    expect((await statutDe(b))?.statut).toBe("en_attente");
    expect((await statutDe(c))?.statut).toBe("acceptee");
  });

  it("un applicateur qui échoue sur une proposition du lot est rapporté, les autres sont décidées", async () => {
    const { branchement } = brancher();
    const [a, b] = await proposerN(branchement, 2);
    // `b` échoue : son contenu fait lever l'applicateur de ce branchement.
    branchement.types[TYPE].appliquer = async (contenu, tx) => {
      await tx.query(`INSERT INTO ${TABLE_EFFETS} (valeur) VALUES ($1)`, [(contenu as Contenu).nom]);
      if ((contenu as Contenu).nom === "Personne 1") throw new Error("refusé par la source");
    };

    const rapport = await deciderEnLot(branchement, {
      decisions: [a, b].map((id) => ({ id, decision: "acceptee" as const })),
      decideur: MARIE,
    });

    expect(rapport[0].issue).toBe("acceptee");
    expect(rapport[1]).toEqual({ id: b, issue: "echec", message: "refusé par la source" });
    expect(await effets()).toEqual(["Personne 0"]);
    expect((await statutDe(b))?.statut).toBe("en_attente");
  });

  it("une décision vide dans le lot bloque tout le lot, jamais prise par défaut (une appli livrée)", async () => {
    const { branchement, appliquer } = brancher();
    const [a, b] = await proposerN(branchement, 2);

    await expect(
      deciderEnLot(branchement, {
        decisions: [
          { id: a, decision: "acceptee" },
          { id: b, decision: undefined as never },
        ],
        decideur: MARIE,
      })
    ).rejects.toBeInstanceOf(ErreurDecision);

    expect(appliquer).not.toHaveBeenCalled();
    expect((await statutDe(a))?.statut).toBe("en_attente");
  });

  it("un lot refuse un décideur sans droit ou sans identité, avant toute décision", async () => {
    const { branchement } = brancher({ peutDecider: false });
    const [a] = await proposerN(branchement, 1);
    await expect(
      deciderEnLot(branchement, { decisions: [{ id: a, decision: "acceptee" }], decideur: MARIE })
    ).rejects.toBeInstanceOf(ErreurDroit);
    await expect(
      deciderEnLot(brancher().branchement, {
        decisions: [{ id: a, decision: "acceptee" }],
        decideur: undefined as never,
      })
    ).rejects.toBeInstanceOf(ErreurDecision);
    expect((await statutDe(a))?.statut).toBe("en_attente");
  });

  it("un lot entièrement refusé finit « refusee », jamais « acceptee » ; « en attente » prime, lu par la brique", async () => {
    const { branchement } = brancher();
    const [a, b, c] = await proposerN(branchement, 3, "import-mars");

    await deciderEnLot(branchement, {
      decisions: [a, b].map((id) => ({ id, decision: "refusee" as const })),
      decideur: MARIE,
    });
    expect((await lireGroupes(branchement)).find((g) => g.groupe === "import-mars")).toMatchObject({
      statut: "en_attente",
      total: 3,
    });

    await decider(branchement, { id: c, decision: "refusee", decideur: MARIE });
    expect((await lireGroupes(branchement)).find((g) => g.groupe === "import-mars")?.statut).toBe("refusee");
  });

  it("lireGroupes compte par groupe, ignore les propositions sans groupe et trie les groupes par localeCompare (le groupement passé en base ne change pas l'ordre)", async () => {
    const { branchement } = brancher();
    for (const [cle, source] of [
      ["a", "Été"],
      ["b", "avril"],
      ["c", "Été"],
      ["d", "étape"],
      ["e", undefined],
    ]) {
      await proposer(branchement, { type: TYPE, cle: cle!, contenu: { nom: cle!, ...(source ? { source } : {}) } });
    }

    const groupes = await lireGroupes(branchement);

    expect(groupes.map((g) => g.groupe)).toEqual(["avril", "étape", "Été"]);
    expect(groupes.find((g) => g.groupe === "Été")).toEqual({
      groupe: "Été",
      statut: "en_attente",
      total: 2,
      enAttente: 2,
    });
  });
});

describe("brique validation : les statuts écrits par le code et la base", () => {
  it("tout statut que le code peut écrire passe la contrainte de la base, et la base n'en admet pas d'autre (projet précédent : le code et le schéma ne listaient pas les mêmes statuts)", async () => {
    // Chaque statut du code s'écrit réellement dans la table.
    for (const statut of STATUTS) {
      await expect(
        query(`INSERT INTO propositions (type, cle, contenu, statut) VALUES ($1, $2, '{}', $3)`, [
          `${PREFIXE_TYPE}_contrainte`,
          `cle-${statut}`,
          statut,
        ])
      ).resolves.toBeDefined();
    }
    // Et la base refuse ce que le code ne sait pas écrire : un statut de plus
    // dans la contrainte sans le code (ou l'inverse) fait échouer l'un ou l'autre.
    await expect(
      query(`INSERT INTO propositions (type, cle, contenu, statut) VALUES ($1, 'cle-connu', '{}', 'connu')`, [
        `${PREFIXE_TYPE}_contrainte`,
      ])
    ).rejects.toThrow();
    const contrainte = await queryOne<{ definition: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
        WHERE c.conrelid = 'propositions'::regclass AND c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%statut%'`
    );
    const admis = [...(contrainte?.definition ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(admis).toEqual([...STATUTS].sort());
  });

  it("l'index unique partiel naît avec la table et porte (type, clé) des propositions en attente ou refusées", async () => {
    const index = await query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'propositions_cle_ouverte_unique'`
    );
    expect(index).toHaveLength(1);
    expect(index[0].indexdef).toContain("UNIQUE");
    expect(index[0].indexdef).toContain("(type, cle)");
    expect(index[0].indexdef).toContain("en_attente");
    expect(index[0].indexdef).toContain("refusee");
    expect(index[0].indexdef).not.toContain("acceptee");
  });
});

// La source « propositions » de l'effacement des données d'une personne
// (brique rgpd). Une proposition décidée reste l'histoire d'une décision : sa
// ligne reste, l'adresse n'y est plus, ni comme décideur ni dans le contenu.
// Comme pour l'export, l'adresse se cherche comme une valeur entière : une
// adresse qui la contient n'est pas la sienne.
describe("effacement des données d'une personne dans les propositions", () => {
  // Un « + » et des points : lus comme une expression régulière, ils
  // laissaient l'adresse en place et touchaient une adresse voisine.
  it("remplace l'adresse comme décideur et comme valeur du contenu, quelle que soit sa casse, et rien d'autre", async () => {
    const ELLE = "decideuse.effacee+rgpd@exemple.test";
    const VOISINE = "decideuseXeffacee+rgpd@exemple.test";
    const ligne = await queryOne<{ id: number }>(
      `INSERT INTO propositions (type, cle, contenu, statut, decide_le, decide_par)
       VALUES ($1, 'e1', $2::jsonb, 'acceptee', now(), $3) RETURNING id`,
      [
        TYPE,
        JSON.stringify({
          demandeur_email: ELLE.toUpperCase(),
          copie: [ELLE],
          voisin: `x.${ELLE}`,
          autre: "autre@exemple.test",
          voisine: VOISINE,
        }),
        ELLE,
      ]
    );
    const intacte = await queryOne<{ id: number }>(
      `INSERT INTO propositions (type, cle, contenu) VALUES ($1, 'e2', $2::jsonb) RETURNING id`,
      [TYPE, JSON.stringify({ demandeur_email: `x.${ELLE}` })]
    );

    const issue = await transaction((tx) => SOURCES_VALIDATION[0].effacer(tx, ELLE));

    expect(issue).toEqual({ lignes: 1 });
    expect(await queryOne(`SELECT contenu, decide_par FROM propositions WHERE id = $1`, [ligne!.id])).toEqual({
      contenu: {
        demandeur_email: "(adresse effacée)",
        copie: ["(adresse effacée)"],
        voisin: `x.${ELLE}`,
        autre: "autre@exemple.test",
        voisine: VOISINE,
      },
      decide_par: "(adresse effacée)",
    });
    expect(await queryOne(`SELECT contenu FROM propositions WHERE id = $1`, [intacte!.id])).toEqual({
      contenu: { demandeur_email: `x.${ELLE}` },
    });
  });
});
