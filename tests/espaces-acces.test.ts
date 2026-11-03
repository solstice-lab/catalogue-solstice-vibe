import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { query } from "../src/lib/db/client";
import { ESPACES } from "../src/config/espaces";
import { COOKIE_ESPACE, choisirEspace, exigerMonEspace, monEspace } from "../src/briques/espaces/acces";
import { creerEspace, rejoindre, retirerMembre } from "../src/briques/espaces/espaces";
import { cookiesDeTest } from "./aide-cookies";
import { jouerLaPersonne } from "./aide-session";
import { adhesionDe, compte, personne, repartirDeZero } from "./aide-espaces";

/*
 * L'accès unique d'un module rattaché à un espace : l'espace de la personne
 * connectée, relu en base à chaque requête, et une base dont chaque requête
 * reçoit l'identifiant de cet espace en $1. C'est l'isolation entre groupes
 * que l'essai tours-de-coloc réécrivait à chaque module (2026-11-03).
 *
 * La table des tâches est celle d'un module fictif, créée pour ce fichier et
 * retirée après lui.
 */

const ALICE = "alice@coloc.example";
const BRUNO = "bruno@coloc.example";
const TACHES = "test_espaces_taches";

beforeAll(async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TACHES} (id SERIAL PRIMARY KEY, espace_id INTEGER NOT NULL REFERENCES espaces(id), titre TEXT NOT NULL)`
  );
});

afterAll(async () => {
  await query(`DROP TABLE IF EXISTS ${TACHES}`);
});

beforeEach(async () => {
  await query(`DELETE FROM ${TACHES}`);
  await repartirDeZero();
  await compte(ALICE);
  await compte(BRUNO);
});

async function creer(email: string, nom: string): Promise<{ id: number; code: string }> {
  const issue = await creerEspace(personne(email), { nom, prenom: email.split("@")[0] });
  if ("erreur" in issue) throw new Error(issue.erreur);
  return issue.espace;
}

describe("l'espace de la personne connectée", () => {
  it("se relit en base à chaque requête : un membre retiré perd l'accès à la requête suivante, sans se reconnecter (un rôle porté par le jeton survivait au retrait du droit)", async () => {
    const { id, code } = await creer(ALICE, "Coloc des Lilas");
    await rejoindre(personne(BRUNO), { code, prenom: "Bruno" });
    jouerLaPersonne(personne(BRUNO));
    expect((await monEspace())?.espace.id).toBe(id);
    await retirerMembre(personne(ALICE), id, await adhesionDe(id, BRUNO));
    expect(await monEspace()).toBeNull();
  });

  it("n'est celui de personne pour un compte désactivé", async () => {
    await creer(ALICE, "Coloc des Lilas");
    jouerLaPersonne(personne(ALICE));
    await query("UPDATE utilisateurs SET actif = false WHERE email = $1", [ALICE]);
    expect(await monEspace()).toBeNull();
  });

  it("renvoie vers « Créer ou rejoindre » une personne sans espace", async () => {
    jouerLaPersonne(personne(BRUNO));
    await expect(exigerMonEspace()).rejects.toMatchObject({ digest: expect.stringContaining("/espace/rejoindre") });
  });

  it("avec plusieurs espaces par compte, suit l'espace choisi, gardé dans un cookie revérifié en base : un cookie vers un espace étranger est ignoré", async () => {
    ESPACES.plusieursParCompte = true;
    const lilas = await creer(ALICE, "Coloc des Lilas");
    const roses = await creer(ALICE, "Coloc des Roses");
    const etranger = await creer(BRUNO, "Coloc de Bruno");
    jouerLaPersonne(personne(ALICE));
    // Par défaut, l'espace rejoint le plus récemment.
    expect((await monEspace())?.espace.id).toBe(roses.id);
    expect(await choisirEspace(personne(ALICE), lilas.id)).toBeUndefined();
    expect((await monEspace())?.espace.id).toBe(lilas.id);
    expect(await choisirEspace(personne(ALICE), etranger.id)).toHaveProperty("erreur");
    cookiesDeTest.set(COOKIE_ESPACE, String(etranger.id));
    expect((await monEspace())?.espace.id).toBe(roses.id);
  });
});

describe("la base de l'espace", () => {
  it("passe l'identifiant de l'espace en $1 : chaque espace ne lit que ses fiches, et une fiche d'un autre espace est introuvable par son identifiant", async () => {
    const lilas = await creer(ALICE, "Coloc des Lilas");
    await creer(BRUNO, "Coloc des Roses");

    jouerLaPersonne(personne(BRUNO));
    const roses = await exigerMonEspace();
    const [tacheDeBruno] = await roses.base.query<{ id: number }>(
      `INSERT INTO ${TACHES} (espace_id, titre) VALUES ($1, $2) RETURNING id`,
      ["Sortir les poubelles"]
    );

    jouerLaPersonne(personne(ALICE));
    const deLilas = await exigerMonEspace();
    expect(deLilas.espace.id).toBe(lilas.id);
    await deLilas.base.query(`INSERT INTO ${TACHES} (espace_id, titre) VALUES ($1, $2)`, ["Arroser les plantes"]);
    expect(
      (await deLilas.base.query<{ titre: string }>(`SELECT titre FROM ${TACHES} WHERE espace_id = $1`)).map(
        ({ titre }) => titre
      )
    ).toEqual(["Arroser les plantes"]);
    expect(
      await deLilas.base.queryOne(`SELECT * FROM ${TACHES} WHERE espace_id = $1 AND id = $2`, [tacheDeBruno.id])
    ).toBeUndefined();
  });

  it("refuse une requête qui ne nomme ni espace_id ni $1, dans une transaction comme hors d'elle", async () => {
    await creer(ALICE, "Coloc des Lilas");
    jouerLaPersonne(personne(ALICE));
    const { base } = await exigerMonEspace();
    await expect(base.query(`SELECT * FROM ${TACHES}`)).rejects.toThrow(/espace_id/);
    await expect(base.query(`SELECT * FROM ${TACHES} WHERE id = $1`)).rejects.toThrow(/espace_id/);
    // Un filtre en commentaire ne filtre rien.
    await expect(base.query(`SELECT * FROM ${TACHES} -- WHERE espace_id = $1`)).rejects.toThrow(/espace_id/);
    await expect(base.query(`SELECT * FROM ${TACHES} /* espace_id = $1 */`)).rejects.toThrow(/espace_id/);
    await expect(base.transaction((tx) => tx.query(`DELETE FROM ${TACHES}`))).rejects.toThrow(/espace_id/);
    expect(await base.transaction((tx) => tx.query(`SELECT * FROM ${TACHES} WHERE espace_id = $1`))).toEqual([]);
  });
});
