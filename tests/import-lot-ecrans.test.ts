import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "../src/lib/db/client";
import { verifierEcran, type Branchement, type ValeursLigne } from "../src/briques/import-lot/branchement";
import { actionEnvoyer } from "../src/briques/import-lot/envoi";
import { actionConfirmer, actionIgnorer, actionSupprimer, lotDeLaPage } from "../src/briques/import-lot/gestes";
import { OCTETS_MAX } from "../src/briques/import-lot/lecture";
import { creerLot, lireLot, type Lot } from "../src/briques/import-lot/lot";
import {
  colonnesRetenues,
  libelleStatutLot,
  lignesRetenues,
  phraseLignesEcartees,
  textesDe,
} from "../src/briques/import-lot/presentation";

/*
 * Les écrans de la brique : ce que les gestes, l'envoi et la page d'un
 * lot font pour n'importe quel branchement. Avant qu'elle les porte, chaque appli recopiait
 * ces ~600 lignes et réécrivait leurs tests (commandes du catalogue, puis
 * équipements d'une appli assemblée) : ces tests-ci suivent la
 * brique dans toute copie, sans aucun module métier. Les gardes de droits
 * restent dans l'appli, qui les teste elle-même.
 */

const revalider = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalider }));

const UN_404 = { digest: expect.stringContaining("404") };

// La base de test est partagée : table cible et lots propres à ce fichier.
const PREFIXE = "test-import-ecrans";

class ErreurDeLAppli extends Error {}

beforeAll(async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS test_import_ecrans (reference TEXT PRIMARY KEY, montant NUMERIC, livraison TEXT)`
  );
});

beforeEach(() => {
  revalider.mockClear();
});

afterEach(async () => {
  await query(`DELETE FROM import_lots WHERE branchement LIKE $1`, [`${PREFIXE}%`]);
  await query(`DELETE FROM test_import_ecrans`);
});

afterAll(async () => {
  await query(`DROP TABLE IF EXISTS test_import_ecrans`);
});

async function ecrire(client: { query: typeof query }, valeurs: ValeursLigne): Promise<"cree"> {
  if (valeurs.reference === "REFUSEE") throw new ErreurDeLAppli("La référence REFUSEE est refusée par l'appli.");
  if (valeurs.reference === "PANNE") throw new Error("panne de la base");
  await client.query(`INSERT INTO test_import_ecrans (reference, montant, livraison) VALUES ($1, $2, $3)`, [
    valeurs.reference,
    valeurs.montant,
    valeurs.livraison,
  ]);
  return "cree";
}

function branchement(surcharge: Partial<Branchement> = {}): Branchement {
  return {
    id: `${PREFIXE}-a`,
    champs: [
      { champ: "reference", entetes: ["Référence"], type: "texte", obligatoire: true },
      { champ: "montant", entetes: ["Montant"], type: "nombre" },
      { champ: "livraison", entetes: ["Date de livraison"], type: "date" },
    ],
    cle: ["reference"],
    formatDate: "jour_mois",
    mode: "mise_a_jour",
    ecrire,
    ...surcharge,
  };
}

const AVEC_ECRAN = branchement({
  ecran: {
    chemin: "/essai-import",
    cheminsEcrits: ["/", "/essais"],
    refus: (erreur) => (erreur instanceof ErreurDeLAppli ? `Rien n'a été écrit. ${erreur.message}` : null),
    textes: {
      rienEcrit: "aucun essai n'a été écrit",
      ecritsRestent: "Les essais qu'il a déjà écrits restent en place.",
      rapport: (rapport) => `${rapport.creees} essai(s) créé(s)`,
    },
  },
});

function csv(lignes: string[][]): Uint8Array {
  return new TextEncoder().encode(
    [["Référence", "Montant", "Date de livraison"], ...lignes].map((l) => l.join(";")).join("\r\n")
  );
}

async function lot(lignes: string[][], b: Branchement = AVEC_ECRAN): Promise<Lot> {
  return creerLot(b, "essai.csv", csv(lignes));
}

async function lotsDuBranchement(): Promise<unknown[]> {
  return query(`SELECT id FROM import_lots WHERE branchement LIKE $1`, [`${PREFIXE}%`]);
}

describe("écrans de la brique import-lot : les gestes sur un lot", () => {
  it("confirmer écrit le lot, dit le rapport avec les mots du branchement et revalide la liste, la page du lot et ce que le lot écrit", async () => {
    const leLot = await lot([["E-1", "12,5", "03/04/2026"]]);

    const retour = await actionConfirmer(AVEC_ECRAN, leLot.id);

    expect(retour).toEqual({ reussite: true, message: "Lot confirmé : 1 essai(s) créé(s)." });
    for (const chemin of ["/essai-import", `/essai-import/${leLot.id}`, "/", "/essais"])
      expect(revalider).toHaveBeenCalledWith(chemin);
    expect((await lireLot(leLot.id, AVEC_ECRAN.id))?.statut).toBe("confirme");
  });

  it("confirmer deux fois le même lot le dit et n'écrit rien de plus (une appli livrée : page périmée soumise deux fois)", async () => {
    const leLot = await lot([["E-1", "1", ""]]);
    await actionConfirmer(AVEC_ECRAN, leLot.id);

    const retour = await actionConfirmer(AVEC_ECRAN, leLot.id);

    expect(retour.reussite).toBe(true);
    expect(retour.message).toMatch(/^Ce lot était déjà confirmé : rien n'a été écrit de plus\. 1 essai/);
    expect(await query(`SELECT reference FROM test_import_ecrans`)).toHaveLength(1);
  });

  it("affiche le refus que l'appli traduit (`refus`) sans page d'erreur : le lot reste en attente, rien n'est revalidé", async () => {
    const leLot = await lot([
      ["E-1", "1", ""],
      ["REFUSEE", "2", ""],
    ]);

    const retour = await actionConfirmer(AVEC_ECRAN, leLot.id);

    expect(retour).toEqual({
      reussite: false,
      message: "Rien n'a été écrit. La référence REFUSEE est refusée par l'appli.",
    });
    expect(revalider).not.toHaveBeenCalled();
    expect((await lireLot(leLot.id, AVEC_ECRAN.id))?.statut).toBe("en_attente");
    expect(await query(`SELECT reference FROM test_import_ecrans`)).toEqual([]);
  });

  it("laisse remonter une panne que l'appli ne traduit pas : elle mène à la page d'erreur, pas à un message trompeur", async () => {
    const leLot = await lot([["PANNE", "1", ""]]);

    await expect(actionConfirmer(AVEC_ECRAN, leLot.id)).rejects.toThrow("panne de la base");
  });

  it("dit le refus du cycle tel que la brique l'écrit : ignorer un lot confirmé", async () => {
    const leLot = await lot([["E-1", "1", ""]]);
    await actionConfirmer(AVEC_ECRAN, leLot.id);

    const retour = await actionIgnorer(AVEC_ECRAN, leLot.id);

    expect(retour).toEqual({ reussite: false, message: "Ce lot est confirmé : il ne peut plus être ignoré." });
  });

  it("ignorer dit ce qui n'a pas été écrit et ne revalide que les pages de l'import", async () => {
    const leLot = await lot([["E-1", "1", ""]]);

    const retour = await actionIgnorer(AVEC_ECRAN, leLot.id);

    expect(retour).toEqual({ reussite: true, message: "Lot ignoré : aucun essai n'a été écrit." });
    expect(revalider.mock.calls.map(([chemin]) => chemin).sort()).toEqual([
      "/essai-import",
      `/essai-import/${leLot.id}`,
    ]);
  });

  it("supprimer ne revalide que la liste : revalider la page du lot supprimé la rendait en 404 avant la redirection de l'écran", async () => {
    const leLot = await lot([["E-1", "1", ""]]);

    const retour = await actionSupprimer(AVEC_ECRAN, leLot.id);

    expect(retour).toEqual({
      reussite: true,
      message: "Lot supprimé. Les essais qu'il a déjà écrits restent en place.",
    });
    expect(revalider.mock.calls.map(([chemin]) => chemin)).toEqual(["/essai-import"]);
    expect(await lireLot(leLot.id, AVEC_ECRAN.id)).toBeNull();
  });

  it.each([
    ["négatif", -1],
    ["au-delà de l'INTEGER", 2_147_483_648],
    ["non entier", 1.5],
  ])(
    "répond « Lot introuvable. » à un identifiant %s posté à la main, sans planter la requête",
    async (_cas, identifiant) => {
      for (const geste of [actionConfirmer, actionIgnorer, actionSupprimer]) {
        expect(await geste(AVEC_ECRAN, identifiant)).toEqual({ reussite: false, message: "Lot introuvable." });
      }
    }
  );

  it("ne touche pas au lot d'un autre branchement, même par son identifiant", async () => {
    const autre = branchement({ id: `${PREFIXE}-b` });
    const leLot = await lot([["E-1", "1", ""]], autre);

    expect((await actionConfirmer(AVEC_ECRAN, leLot.id)).reussite).toBe(false);
    expect((await actionIgnorer(AVEC_ECRAN, leLot.id)).reussite).toBe(false);
    await actionSupprimer(AVEC_ECRAN, leLot.id);
    expect((await lireLot(leLot.id, autre.id))?.statut).toBe("en_attente");
  });
});

describe("écrans de la brique import-lot : la page d'un lot", () => {
  it("rend un 404 pour un identifiant illisible ou le lot d'un autre branchement, comme pour un lot qui n'existe pas", async () => {
    const autre = await lot([["E-1", "1", ""]], branchement({ id: `${PREFIXE}-b` }));

    await expect(lotDeLaPage(AVEC_ECRAN, "abc")).rejects.toMatchObject(UN_404);
    await expect(lotDeLaPage(AVEC_ECRAN, "99999999999")).rejects.toMatchObject(UN_404);
    await expect(lotDeLaPage(AVEC_ECRAN, String(autre.id))).rejects.toMatchObject(UN_404);
  });

  it("lit le lot de son branchement", async () => {
    const leLot = await lot([["E-1", "1", ""]]);

    expect((await lotDeLaPage(AVEC_ECRAN, String(leLot.id))).nomFichier).toBe("essai.csv");
  });

  it("montre par défaut chaque champ dans l'ordre déclaré, titré par son premier en-tête, en chiffres pour un nombre ou une date", () => {
    expect(colonnesRetenues(branchement())).toEqual([
      { cle: "v:reference", titre: "Référence", chiffres: false },
      { cle: "v:montant", titre: "Montant", chiffres: true },
      { cle: "v:livraison", titre: "Date de livraison", chiffres: true },
    ]);
  });

  it("suit l'ordre, les titres et les largeurs des colonnes que le branchement déclare", () => {
    const declare = branchement({
      ecran: {
        chemin: "/essai-import",
        colonnes: [
          { champ: "livraison", titre: "Livraison" },
          { champ: "reference", largeur: "130px" },
        ],
      },
    });

    expect(colonnesRetenues(declare)).toEqual([
      { cle: "v:livraison", titre: "Livraison", chiffres: true },
      { cle: "v:reference", titre: "Référence", chiffres: false, largeur: "130px" },
    ]);
  });

  it("garde la valeur du lot pour le tri et montre la date formatée, un tiret pour une cellule vide, et l'affichage du branchement", async () => {
    const declare = branchement({
      ecran: {
        chemin: "/essai-import",
        colonnes: [{ champ: "reference" }, { champ: "montant", affichage: (v) => `${v} €` }, { champ: "livraison" }],
      },
    });
    const leLot = await lot(
      [
        ["E-1", "12,5", "03/04/2026"],
        ["E-2", "", ""],
        ["E-1", "", ""],
      ],
      declare
    );

    const [premiere, seconde] = lignesRetenues(declare, leLot);

    expect(premiere).toMatchObject({
      ligne: "2, 4",
      "v:montant": 12.5,
      "a:montant": "12.5 €",
      "v:livraison": "2026-04-03",
      "a:livraison": "03/04/2026",
    });
    expect(seconde).toMatchObject({ ligne: "3", "v:montant": null, "a:montant": "—", "a:livraison": "—" });
  });
});

describe("écrans de la brique import-lot : les réglages de l'écran", () => {
  it("refuse un branchement qui déclare un champ de décision : l'écran ne sait pas encore le saisir, et un lot qu'on ne peut pas confirmer serait une impasse", () => {
    const avecDecision = branchement({
      champs: [...branchement().champs, { champ: "paye", entetes: ["Payé"], type: "texte", decision: true }],
    });

    expect(() => verifierEcran(avecDecision)).toThrow(/décision.*paye.*à venir/s);
  });

  it("refuse une colonne d'écran qui n'est pas un champ déclaré, et un chemin qui ne commence pas par « / »", () => {
    expect(() =>
      verifierEcran(branchement({ ecran: { chemin: "/essai-import", colonnes: [{ champ: "inconnu" }] } }))
    ).toThrow(/inconnu/);
    expect(() => verifierEcran(branchement({ ecran: { chemin: "importer" } }))).toThrow(/chemin/);
    expect(() => verifierEcran(AVEC_ECRAN)).not.toThrow();
  });

  it("exige le réglage `ecran` et son chemin : la brique ne nomme pas les pages d'une appli (un « /importer » par défaut passait pour une trace des commandes, relevé en relecture)", async () => {
    expect(() => verifierEcran(branchement())).toThrow(/ecran/);
    const leLot = await lot([["E-1", "1", ""]], branchement());
    await expect(actionIgnorer(branchement(), leLot.id)).rejects.toThrow(/chemin/);
    expect((await lireLot(leLot.id, `${PREFIXE}-a`))?.statut).toBe("en_attente");
  });

  it("donne des textes neutres à un branchement qui n'en déclare pas", () => {
    const textes = textesDe(branchement());

    expect(textes.rapport({ creees: 2, mises_a_jour: 1, inchangees: 0 })).toBe(
      "2 lignes créées, 1 mise à jour, 0 inchangée"
    );
    expect(textes.rienEcrit).toBe("rien n'a été écrit");
  });

  it("dit le statut d'un lot en mots, et un statut inconnu en rouge, jamais comme un état sain", () => {
    expect(libelleStatutLot("en_attente")).toEqual({ libelle: "En attente", ton: "accent" });
    expect(libelleStatutLot("confirme")).toEqual({ libelle: "Confirmé", ton: "positif" });
    expect(libelleStatutLot("ignore")).toEqual({ libelle: "Ignoré", ton: "neutre" });
    expect(libelleStatutLot("autre")).toEqual({ libelle: "autre", ton: "negatif" });
  });
});

describe("phrase des lignes écartées d'un lot", () => {
  it("s'accorde au singulier : « elles restent listées » dit après « 1 ligne écartée » a été relevé en recette", () => {
    const phrase = phraseLignesEcartees(1);
    expect(phrase).toBe("1 ligne écartée ne sera pas importée : elle reste listée sur cette page.");
  });

  it("s'accorde au pluriel dès deux lignes", () => {
    expect(phraseLignesEcartees(3)).toBe(
      "3 lignes écartées ne seront pas importées : elles restent listées sur cette page."
    );
  });
});

describe("écrans de la brique import-lot : l'envoi du fichier (Route Handler, décision du 2026-10-19)", () => {
  function envoi(octets: Uint8Array, nom: string, entetes: Record<string, string> = {}): Request {
    const donnees = new FormData();
    donnees.set("fichier", new File([octets as BlobPart], nom));
    return new Request("http://localhost/essai-import/envoi", { method: "POST", body: donnees, headers: entetes });
  }

  it("crée le lot et rend son identifiant, que l'écran suit vers la page du lot", async () => {
    const reponse = await actionEnvoyer(AVEC_ECRAN, envoi(csv([["E-1", "1", ""]]), "essai.csv"));

    expect(reponse.status).toBe(201);
    const { lotId } = (await reponse.json()) as { lotId: number };
    expect((await lireLot(lotId, AVEC_ECRAN.id))?.nomFichier).toBe("essai.csv");
  });

  it("rend le message de la brique pour un fichier refusé (.xls), sans créer de lot", async () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

    const reponse = await actionEnvoyer(AVEC_ECRAN, envoi(xls, "ancien.xls"));

    expect(reponse.status).toBe(422);
    expect(((await reponse.json()) as { message: string }).message).toMatch(/\.xlsx/);
    expect(await lotsDuBranchement()).toEqual([]);
  });

  it("refuse en 413 un corps trop gros même sans content-length : il est compté en le lisant, pas chargé en entier", async () => {
    let lus = 0;
    const flux = new ReadableStream<Uint8Array>({
      pull(controleur) {
        lus += 1;
        controleur.enqueue(new Uint8Array(1024 * 1024));
      },
    });
    const requete = new Request("http://localhost/essai-import/envoi", {
      method: "POST",
      body: flux,
      duplex: "half",
      headers: { "content-type": "multipart/form-data; boundary=essai" },
    } as RequestInit);

    const reponse = await actionEnvoyer(AVEC_ECRAN, requete);

    expect(reponse.status).toBe(413);
    expect(lus).toBeLessThan(40);
    expect(await lotsDuBranchement()).toEqual([]);
  });

  it("refuse en 413 un envoi qui annonce plus que le plafond de la brique, avant de lire le corps", async () => {
    const reponse = await actionEnvoyer(
      AVEC_ECRAN,
      envoi(csv([["E-1", "1", ""]]), "essai.csv", { "content-length": String(OCTETS_MAX + 2 * 1024 * 1024) })
    );

    expect(reponse.status).toBe(413);
    expect(((await reponse.json()) as { message: string }).message).toMatch(/10 Mo/);
  });

  it("refuse en 403 un envoi qui vient d'un autre site : une Server Action contrôle l'origine d'office, un Route Handler non", async () => {
    const autreSite = await actionEnvoyer(
      AVEC_ECRAN,
      envoi(csv([["E-1", "1", ""]]), "essai.csv", { origin: "http://autre-site.example" })
    );
    expect(autreSite.status).toBe(403);
    expect(await lotsDuBranchement()).toEqual([]);

    const memeSite = await actionEnvoyer(
      AVEC_ECRAN,
      envoi(csv([["E-1", "1", ""]]), "essai.csv", { origin: "http://localhost" })
    );
    expect(memeSite.status).toBe(201);
  });

  // Essai du 2026-11-13 : dans GitHub Codespaces, le proxy transmet l'origine
  // localhost:3000 et l'hôte redirigé en x-forwarded-host ; l'envoi était
  // refusé. L'exception ne vaut que là, hors production.
  it("accepte, dans un Codespace hors production, l'origine localhost:3000 que transmet son proxy, et la refuse ailleurs", async () => {
    const enTetes = { origin: "http://localhost:3000", "x-forwarded-host": "essai-abc123-3000.app.github.dev" };
    try {
      vi.stubEnv("CODESPACE_NAME", "essai-abc123");
      vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev");
      vi.stubEnv("NODE_ENV", "production");
      expect((await actionEnvoyer(AVEC_ECRAN, envoi(csv([["E-1", "1", ""]]), "essai.csv", enTetes))).status).toBe(403);
      vi.stubEnv("NODE_ENV", "development");
      expect((await actionEnvoyer(AVEC_ECRAN, envoi(csv([["E-1", "1", ""]]), "essai.csv", enTetes))).status).toBe(201);
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await actionEnvoyer(AVEC_ECRAN, envoi(csv([["E-1", "1", ""]]), "essai.csv", enTetes))).status).toBe(403);
  });

  it("refuse une requête sans fichier, par un message et non une erreur du serveur", async () => {
    const reponse = await actionEnvoyer(
      AVEC_ECRAN,
      new Request("http://localhost/essai-import/envoi", { method: "POST", body: new FormData() })
    );

    expect(reponse.status).toBe(422);
    expect(((await reponse.json()) as { message: string }).message).toMatch(/fichier/i);
  });
});
