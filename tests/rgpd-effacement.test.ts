import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supprimerTousLesComptes } from "./aide-comptes";
import { query, queryOne, transaction } from "../src/lib/db/client";
import { empreinteDeLAdresse } from "../src/briques/comptes/code-email";
import { secretDeSession } from "../src/briques/comptes/jeton";
import { NON_EXPORTEES, SOURCES } from "../src/config/donnees-personnelles";
import { exporterDonnees } from "../src/briques/rgpd/export";
import {
  apercevoirEffacement,
  effacerDonnees,
  type BilanEffacement,
  type GesteEffacement,
} from "../src/briques/rgpd/effacement";

/*
 * L'effacement des données d'une personne (RGPD art. 17), par l'admin, sur
 * demande. Chaque source du registre efface ou anonymise ses propres lignes,
 * dans une seule transaction : tout part, ou rien. Le compte s'anonymise sans
 * se supprimer, pour que ce qui le désigne par son numéro (le journal d'audit)
 * reste en place sans plus mener à l'adresse.
 *
 * Ce que chaque module ou brique fait de ses lignes se vérifie dans son propre
 * fichier de tests : ici, l'enchaînement, avec les sources de la brique comptes.
 */

const ELLE = "personne.effacee@exemple.test";
const AUTRE = "autre.admin@exemple.test";
const DEMANDEUR = AUTRE;
const EMPREINTE_SESSION = "empreinte-de-session-du-test-effacement";

async function compte(email: string, role = "membre"): Promise<number> {
  // Géré par l'appli : le rôle en base fait foi, quelle que soit la configuration.
  const ligne = await queryOne<{ id: number }>(
    `INSERT INTO utilisateurs (email, role, gere_par_l_appli, derniere_connexion) VALUES ($1, $2, true, now()) RETURNING id`,
    [email, role]
  );
  return ligne!.id;
}

async function session(id: number) {
  await query(
    `INSERT INTO sessions (empreinte, utilisateur_id, expire_le) VALUES ($1, $2, now() + interval '30 days')`,
    [`${EMPREINTE_SESSION}-${id}`, id]
  );
}

async function demandeDeCode(email: string) {
  await query(
    `INSERT INTO codes_connexion (adresse_empreinte, ip_empreinte, code_empreinte, expire_le)
     VALUES ($1, 'empreinte-ip-du-test', 'empreinte-code-du-test', now() + interval '10 minutes')`,
    [empreinteDeLAdresse(secretDeSession(), email)]
  );
}

async function nettoyer() {
  await supprimerTousLesComptes();
  const secret = secretDeSession();
  await query(`DELETE FROM codes_connexion WHERE adresse_empreinte IN ($1, $2)`, [
    empreinteDeLAdresse(secret, ELLE),
    empreinteDeLAdresse(secret, AUTRE),
  ]);
}

const bilan = (issue: BilanEffacement | { erreur: string }): BilanEffacement => {
  if ("erreur" in issue) throw new Error(`effacement refusé : ${issue.erreur}`);
  return issue;
};

const lignesDe = (resultat: BilanEffacement, cle: string) => {
  const source = resultat.sources.find((s) => s.cle === cle);
  if (!source) throw new Error(`source « ${cle} » absente du bilan`);
  return source.lignes;
};

beforeEach(nettoyer);
afterEach(async () => {
  vi.unstubAllEnvs();
  await nettoyer();
});

describe("effacement des données d'une personne", () => {
  it("anonymise le compte sans le supprimer, ferme ses sessions et efface ses demandes de code : l'export de l'adresse ne rend plus rien", async () => {
    await compte(AUTRE, "admin");
    const id = await compte(ELLE);
    await session(id);
    await demandeDeCode(ELLE);

    const resultat = bilan(await effacerDonnees(ELLE, { transaction, demandeur: DEMANDEUR }));

    expect(resultat.effectue).toBe(true);
    expect(lignesDe(resultat, "compte")).toBe(1);
    expect(lignesDe(resultat, "sessions")).toBe(1);
    expect(lignesDe(resultat, "codes-connexion")).toBe(1);
    const reste = await queryOne<{
      email: string;
      actif: boolean;
      gere_par_l_appli: boolean;
      derniere_connexion: Date | null;
    }>(`SELECT email, actif, gere_par_l_appli, derniere_connexion FROM utilisateurs WHERE id = $1`, [id]);
    expect(reste).toEqual({
      email: `efface-${id}@efface.invalid`,
      actif: false,
      gere_par_l_appli: false,
      derniere_connexion: null,
    });
    for (const source of (await exporterDonnees(ELLE)).sources) expect(source.lignes).toEqual([]);
  });

  // L'aperçu joue le même effacement et l'annule : ce que l'admin lit avant de
  // confirmer est exactement ce que la confirmation fera, refus compris.
  it("l'aperçu dit ce qui serait effacé, source par source, sans rien changer", async () => {
    await compte(AUTRE, "admin");
    const id = await compte(ELLE);
    await session(id);

    const resultat = bilan(await apercevoirEffacement(ELLE, { transaction, demandeur: DEMANDEUR }));

    expect(resultat.effectue).toBe(false);
    expect(resultat.sources.map((s) => s.cle)).toEqual(SOURCES.map((s) => s.cle));
    expect(lignesDe(resultat, "compte")).toBe(1);
    expect(lignesDe(resultat, "sessions")).toBe(1);
    expect(await queryOne(`SELECT email FROM utilisateurs WHERE id = $1`, [id])).toEqual({ email: ELLE });
    expect(await query(`SELECT 1 FROM sessions WHERE utilisateur_id = $1`, [id])).toHaveLength(1);
  });

  it("retrouve l'adresse quelles que soient sa casse et ses espaces", async () => {
    await compte(AUTRE, "admin");
    await compte(ELLE);
    const resultat = bilan(await effacerDonnees(`  ${ELLE.toUpperCase()} `, { transaction, demandeur: DEMANDEUR }));
    expect(resultat.adresse).toBe(ELLE);
    expect(lignesDe(resultat, "compte")).toBe(1);
  });

  // Même règle que la désactivation (brique comptes) : une appli sans admin
  // actif ne s'administre plus.
  it("refuse d'effacer le dernier admin actif, et n'efface alors rien d'aucune source", async () => {
    await compte(AUTRE);
    const id = await compte(ELLE, "admin");
    await session(id);

    const issue = await effacerDonnees(ELLE, { transaction, demandeur: DEMANDEUR });

    expect(issue).toEqual({ erreur: expect.stringMatching(/dernier compte administrateur actif/) });
    expect(await query(`SELECT 1 FROM sessions WHERE utilisateur_id = $1`, [id])).toHaveLength(1);
    expect(await queryOne(`SELECT email, actif FROM utilisateurs WHERE id = $1`, [id])).toEqual({
      email: ELLE,
      actif: true,
    });
  });

  it("dit le refus dès l'aperçu", async () => {
    await compte(ELLE, "admin");
    expect(await apercevoirEffacement(ELLE, { transaction, demandeur: DEMANDEUR })).toEqual({
      erreur: expect.stringMatching(/dernier compte administrateur actif/),
    });
  });

  // L'admin qui s'effacerait perdrait son accès en plein geste, et personne
  // n'aurait vérifié que la demande vient de lui : un autre admin le fait.
  it("refuse qu'un admin efface ses propres données", async () => {
    await compte(AUTRE, "admin");
    await compte(ELLE, "admin");
    expect(await effacerDonnees(ELLE, { transaction, demandeur: ELLE.toUpperCase() })).toEqual({
      erreur: expect.stringMatching(/vos propres données/),
    });
    expect(await queryOne(`SELECT email FROM utilisateurs WHERE email = $1`, [ELLE])).toEqual({ email: ELLE });
  });

  // Une adresse écrite dans la configuration redonne un compte neuf à sa
  // prochaine connexion, et reste écrite dans le code : l'effacement se fait,
  // et le bilan dit de la retirer.
  it("avertit quand l'adresse est encore dans la configuration", async () => {
    vi.stubEnv("COMPTES_PREMIER_ADMIN", ELLE);
    await compte(AUTRE, "admin");
    await compte(ELLE, "admin");

    const resultat = bilan(await effacerDonnees(ELLE, { transaction, demandeur: DEMANDEUR }));

    expect(lignesDe(resultat, "compte")).toBe(1);
    expect(resultat.avertissements).toEqual([expect.stringMatching(/COMPTES_PREMIER_ADMIN/)]);
  });

  it("avertit aussi pour une adresse de la configuration qui n'a jamais eu de compte", async () => {
    vi.stubEnv("COMPTES_PREMIER_ADMIN", ELLE);
    const resultat = bilan(await effacerDonnees(ELLE, { transaction, demandeur: DEMANDEUR }));
    expect(lignesDe(resultat, "compte")).toBe(0);
    expect(resultat.avertissements).toEqual([expect.stringMatching(/COMPTES_PREMIER_ADMIN/)]);
  });

  // Le registre se parcourt à l'envers : le compte s'anonymise en dernier,
  // après ce qui le retrouve par son adresse (ses sessions, le journal). Une
  // source placée avant lui ne compterait plus rien, sans erreur.
  it("le compte est la première source du registre", () => {
    expect(SOURCES[0].cle).toBe("compte");
  });

  it("efface une adresse sans compte, sans rien tracer", async () => {
    await demandeDeCode(ELLE);
    const gestes: GesteEffacement[] = [];

    const resultat = bilan(
      await effacerDonnees(ELLE, {
        transaction,
        demandeur: DEMANDEUR,
        trace: async (_executeur, geste) => {
          gestes.push(geste);
        },
      })
    );

    expect(lignesDe(resultat, "compte")).toBe(0);
    expect(lignesDe(resultat, "codes-connexion")).toBe(1);
    expect(gestes).toEqual([]);
  });

  // Le journal ne garde aucune adresse dans une référence : le compte se dit
  // par son numéro, comme les autres gestes de l'administration des comptes.
  it("trace l'anonymisation du compte comme une modification de « compte n°<id> », sans l'adresse", async () => {
    await compte(AUTRE, "admin");
    const id = await compte(ELLE);
    const gestes: GesteEffacement[] = [];

    bilan(
      await effacerDonnees(ELLE, {
        transaction,
        demandeur: DEMANDEUR,
        trace: async (_executeur, geste) => {
          gestes.push(geste);
        },
      })
    );

    expect(gestes).toEqual([
      {
        action: "modification",
        entite: "compte",
        entiteId: id,
        libelle: `compte n°${id}`,
        champs: ["email", "actif", "gere_par_l_appli", "derniere_connexion"],
      },
    ]);
    expect(JSON.stringify(gestes)).not.toContain(ELLE);
  });

  it("une trace qui échoue annule tout l'effacement", async () => {
    await compte(AUTRE, "admin");
    const id = await compte(ELLE);
    await session(id);

    await expect(
      effacerDonnees(ELLE, {
        transaction,
        demandeur: DEMANDEUR,
        trace: async () => {
          throw new Error("trace en panne");
        },
      })
    ).rejects.toThrow("trace en panne");

    expect(await queryOne(`SELECT email FROM utilisateurs WHERE id = $1`, [id])).toEqual({ email: ELLE });
    expect(await query(`SELECT 1 FROM sessions WHERE utilisateur_id = $1`, [id])).toHaveLength(1);
  });

  // Ce qu'aucune adresse ne rattache (un nom de client, un texte libre) ne
  // s'efface pas d'ici : le bilan le rappelle, comme l'export.
  it("rappelle ce qu'il ne peut pas effacer, et chaque source dit ce qu'elle fait de ses lignes", async () => {
    const resultat = bilan(await apercevoirEffacement(ELLE, { transaction, demandeur: DEMANDEUR }));
    expect(resultat.nonEffacees).toEqual(NON_EXPORTEES.map(({ quoi, pourquoi }) => ({ quoi, pourquoi })));
    for (const source of resultat.sources) expect(source.effacement.length).toBeGreaterThan(0);
  });
});
