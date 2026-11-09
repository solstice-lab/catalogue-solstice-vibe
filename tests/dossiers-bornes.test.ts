import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "../src/lib/db/client";
import { ENTIER_MAX } from "../src/lib/db/bornes";
import { creerDossier, lireDossierParIdentifiant, type ChampsDossier } from "../src/lib/db/dossiers";
import { LONGUEUR_MAX_DOSSIER } from "../src/lib/dossiers-domaine";
import {
  creerDossierAction,
  modifierDossierAction,
  supprimerDossierAction,
  supprimerDossiersAction,
} from "../src/app/dossiers/actions";
import { UTILISATEURS_DEMO } from "../src/briques/comptes/demo";
import { jouer } from "./aide-session";

/*
 * Les bornes du patron dossiers : ce que la base refuse en levant (INTEGER, DATE,
 * unicité) se refuse AVANT elle, avec un message d'écran ou un 404 (audit du
 * 2026-11-09 : un montant géant, un « 2026-06-31 » ou un id d'URL trop grand
 * donnaient la page d'erreur). Les tests passent par les server actions, comme le
 * formulaire.
 */

const revalider = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalider }));

// Le pré-contrôle de référence se coupe à la demande : il simule la course où deux
// créations passent le contrôle avant que l'une d'elles écrive.
const precontrole = vi.hoisted(() => ({ coupe: false }));
vi.mock("../src/lib/db/dossiers", async (original) => {
  const reel = await original<typeof import("../src/lib/db/dossiers")>();
  return {
    ...reel,
    referenceDejaPrise: (...args: Parameters<typeof reel.referenceDejaPrise>) =>
      precontrole.coupe ? Promise.resolve(false) : reel.referenceDejaPrise(...args),
  };
});

const PREFIXE = "TEST-BORNES-";
const UN_REDIRECT = { digest: expect.stringContaining("NEXT_REDIRECT") };
const LIBELLE_CHAMP = { reference: "référence", client: "client", notes: "notes" } as const;

const champs = (reference: string, modifications: Partial<ChampsDossier> = {}): ChampsDossier => ({
  reference: `${PREFIXE}${reference}`,
  client: "Client fictif",
  montant_centimes: 100_000,
  statut: "en_cours",
  echeance: null,
  notes: null,
  ...modifications,
});

function formulaire(valeurs: Record<string, string>): FormData {
  const donnees = new FormData();
  const base = {
    reference: `${PREFIXE}F`,
    client: "Client fictif",
    montant: "1 000,00",
    statut: "en_cours",
    ...valeurs,
  };
  for (const [nom, valeur] of Object.entries(base)) donnees.set(nom, valeur);
  return donnees;
}

async function creer(valeurs: Record<string, string> = {}) {
  return creerDossierAction({}, formulaire(valeurs));
}

const nombreDeDossiers = async () =>
  Number(
    (await query<{ n: string }>("SELECT count(*) AS n FROM dossiers WHERE reference LIKE $1", [`${PREFIXE}%`]))[0].n
  );

beforeAll(async () => {
  for (const { email, role } of Object.values(UTILISATEURS_DEMO)) {
    await query("INSERT INTO utilisateurs (email, role) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING", [email, role]);
  }
});

beforeEach(() => {
  jouer("admin");
  precontrole.coupe = false;
});

afterEach(async () => {
  await query("DELETE FROM journal_audit WHERE entite = 'dossiers' AND libelle LIKE $1", [`${PREFIXE}%`]);
  await query("DELETE FROM dossiers WHERE reference LIKE $1", [`${PREFIXE}%`]);
});

describe("montant d'un dossier", () => {
  it("refuse un montant au-delà de l'INTEGER de la base par un message, sans écrire (colonne montant_centimes)", async () => {
    // 21 474 836,48 € = ENTIER_MAX + 1 centime.
    const resultat = await creer({ montant: "21 474 836,48" });
    expect(resultat.erreur).toMatch(/montant/i);
    expect(await nombreDeDossiers()).toBe(0);
  });

  it("refuse un montant énorme sans lever (« 99999999999999999999 » dépasse l'INTEGER)", async () => {
    expect((await creer({ montant: "99999999999999999999" })).erreur).toMatch(/montant/i);
  });

  it("accepte exactement le plus grand montant que la colonne porte", async () => {
    await expect(creer({ montant: "21 474 836,47" })).rejects.toMatchObject(UN_REDIRECT);
    const [ligne] = await query<{ montant_centimes: number }>(
      "SELECT montant_centimes FROM dossiers WHERE reference = $1",
      [`${PREFIXE}F`]
    );
    expect(ligne.montant_centimes).toBe(ENTIER_MAX);
  });

  it("refuse un montant négatif : un dossier est un montant à gagner, un avoir serait un autre module", async () => {
    expect((await creer({ montant: "-500" })).erreur).toMatch(/négatif|positif/i);
    expect(await nombreDeDossiers()).toBe(0);
  });
});

describe("échéance d'un dossier", () => {
  it("refuse une date absente du calendrier (« 2026-06-31 » passait le motif puis faisait lever la base)", async () => {
    expect((await creer({ echeance: "2026-06-31" })).erreur).toMatch(/échéance/i);
    expect(await nombreDeDossiers()).toBe(0);
  });

  it("accepte un 29 février d'année bissextile", async () => {
    await expect(creer({ echeance: "2028-02-29" })).rejects.toMatchObject(UN_REDIRECT);
  });
});

describe("longueur des champs texte", () => {
  it.each(["reference", "client", "notes"] as const)("refuse un champ « %s » plus long que sa borne", async (nom) => {
    const resultat = await creer({ [nom]: "x".repeat(LONGUEUR_MAX_DOSSIER[nom] + 1) });
    expect(resultat.erreur).toMatch(new RegExp(LIBELLE_CHAMP[nom], "i"));
    expect(await nombreDeDossiers()).toBe(0);
  });

  it("accepte des champs à leur longueur maximale", async () => {
    await expect(
      creer({
        reference: `${PREFIXE}${"x".repeat(LONGUEUR_MAX_DOSSIER.reference - PREFIXE.length)}`,
        client: "c".repeat(LONGUEUR_MAX_DOSSIER.client),
        notes: "n".repeat(LONGUEUR_MAX_DOSSIER.notes),
      })
    ).rejects.toMatchObject(UN_REDIRECT);
  });
});

describe("identifiants hors de l'INTEGER de la base", () => {
  it("la fiche d'un id numérique trop grand, nul ou négatif est introuvable au lieu de lever (URL /dossiers/99999999999)", async () => {
    expect(await lireDossierParIdentifiant("99999999999")).toBeUndefined();
    expect(await lireDossierParIdentifiant(String(ENTIER_MAX + 1))).toBeUndefined();
    expect(await lireDossierParIdentifiant("0")).toBeUndefined();
  });

  it("la fiche d'un id existant se lit toujours par son id numérique", async () => {
    const dossier = await creerDossier(champs("LECTURE"));
    expect((await lireDossierParIdentifiant(String(dossier.id)))?.reference).toBe(`${PREFIXE}LECTURE`);
  });

  it("modifier un id hors plage rend un message de formulaire au lieu de lever", async () => {
    for (const id of [ENTIER_MAX + 1, 0, -3, 1.5, Number.NaN]) {
      const resultat = await modifierDossierAction(id, {}, formulaire({}));
      expect(resultat.erreur).toMatch(/introuvable/i);
    }
  });

  it("supprimer un id hors plage ne lève pas et ne supprime rien", async () => {
    const dossier = await creerDossier(champs("GARDE"));
    await expect(supprimerDossierAction(ENTIER_MAX + 1)).rejects.toMatchObject(UN_REDIRECT);
    expect(await lireDossierParIdentifiant(String(dossier.id))).toBeDefined();
  });

  it("une suppression en lot ignore les ids hors plage et supprime les autres", async () => {
    const dossier = await creerDossier(champs("LOT"));
    await supprimerDossiersAction([ENTIER_MAX + 1, 0, dossier.id]);
    expect(await lireDossierParIdentifiant(String(dossier.id))).toBeUndefined();
  });
});

describe("référence unique", () => {
  it("le pré-contrôle dit le doublon d'une création", async () => {
    await creerDossier(champs("DOUBLON"));
    expect((await creer({ reference: `${PREFIXE}DOUBLON` })).erreur).toMatch(/existe déjà/);
  });

  it("deux créations simultanées de la même référence : la perdante reçoit le message, pas la violation brute (dossiers_reference_key)", async () => {
    precontrole.coupe = true;
    await creerDossier(champs("COURSE"));
    expect((await creer({ reference: `${PREFIXE}COURSE` })).erreur).toMatch(/existe déjà/);
    expect(await nombreDeDossiers()).toBe(1);
  });

  it("une modification qui prend la référence d'un autre dossier dans la même course reçoit le message", async () => {
    precontrole.coupe = true;
    await creerDossier(champs("A"));
    const b = await creerDossier(champs("B"));
    const resultat = await modifierDossierAction(b.id, {}, formulaire({ reference: `${PREFIXE}A` }));
    expect(resultat.erreur).toMatch(/existe déjà/);
  });
});
