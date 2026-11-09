import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supprimerTousLesComptes } from "./aide-comptes";
import { jouer, jouerLaConnexion, personneJouee } from "./aide-session";
import { DROITS, ROLE_ADMIN, ROLE_PAR_DEFAUT, ROLES } from "../src/config/acces";
import { query, queryOne } from "../src/lib/db/client";
import { mailsCaptures, viderMailsCaptures } from "../src/briques/mails/envoi";
import { inviter } from "../src/briques/comptes/administration";
import { ACTIONS_GESTION_COMPTES } from "../src/briques/gestion-comptes/domaine";
import {
  changerRoleAction,
  desactiverAction,
  fermerDomaineAction,
  inviterAction,
  ouvrirDomaineAction,
  reactiverAction,
} from "../src/app/comptes/actions";
// Brique journal : les gestes de /comptes se tracent dans le journal d'audit.
import { lireJournal } from "../src/briques/journal/journal";
// Fin de la brique journal.

/*
 * L'écran /comptes de la brique gestion-comptes : ses server
 * actions se postent sans passer par l'écran, chacune garde donc sa porte.
 * Les règles elles-mêmes sont verrouillées dans
 * tests/comptes-administration.test.ts ; ici, ce que l'appli y branche.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const UN_404 = { digest: expect.stringContaining("404") };
const AUTRE_ROLE = ROLES.find((role) => role !== ROLE_ADMIN) ?? ROLE_PAR_DEFAUT;

async function vider(): Promise<void> {
  await supprimerTousLesComptes();
  await query("DELETE FROM domaines_admis");
}

// La personne jouée a un compte en base, comme en vrai : un geste peut
// désigner son auteur par son compte (brique journal, si l'appli l'a).
beforeEach(async () => {
  await vider();
  viderMailsCaptures();
  await query("INSERT INTO utilisateurs (email, role) VALUES ($1, $2)", [
    personneJouee()!.email,
    personneJouee()!.role,
  ]);
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(vider);

describe("droit d'administrer les comptes", () => {
  it("revient au rôle que la brique comptes protège : sinon la protection du dernier admin garderait un autre rôle que celui qui administre", () => {
    expect(ACTIONS_GESTION_COMPTES).toEqual(["comptes.administrer"]);
    expect(DROITS["comptes.administrer"]).toContain(ROLE_ADMIN);
  });

  it("répond par un 404 à qui n'a pas le droit, sur chaque action, et rien ne s'écrit (une action se poste sans passer par l'écran)", async () => {
    const issue = await inviter("cible@client.example", ROLE_ADMIN, null);
    if ("erreur" in issue) throw new Error(issue.erreur);
    for (const role of [AUTRE_ROLE, null]) {
      jouer(role);
      await expect(inviterAction("intrus@client.example", ROLE_ADMIN, false)).rejects.toMatchObject(UN_404);
      await expect(changerRoleAction(issue.compte.id, AUTRE_ROLE)).rejects.toMatchObject(UN_404);
      await expect(desactiverAction(issue.compte.id)).rejects.toMatchObject(UN_404);
      await expect(reactiverAction(issue.compte.id)).rejects.toMatchObject(UN_404);
      await expect(ouvrirDomaineAction("client.example")).rejects.toMatchObject(UN_404);
      await expect(fermerDomaineAction("client.example")).rejects.toMatchObject(UN_404);
    }
    expect(await query("SELECT email, role, actif FROM utilisateurs WHERE email LIKE '%@client.example'")).toEqual([
      { email: "cible@client.example", role: ROLE_ADMIN, actif: true },
    ]);
    expect(await query("SELECT 1 FROM domaines_admis")).toEqual([]);
  });
});

describe("actions de /comptes", () => {
  it("refusent de désactiver ou de rétrograder le dernier admin, postées à la main sans l'écran (seconde porte, projet précédent)", async () => {
    const issue = await inviter("chef@client.example", ROLE_ADMIN, null);
    if ("erreur" in issue) throw new Error(issue.erreur);
    expect(await desactiverAction(issue.compte.id)).toEqual({
      erreur: expect.stringMatching(/dernier compte administrateur actif/),
    });
    expect(await changerRoleAction(issue.compte.id, AUTRE_ROLE)).toEqual({
      erreur: expect.stringMatching(/dernier compte administrateur actif/),
    });
    expect(await queryOne("SELECT role, actif FROM utilisateurs WHERE id = $1", [issue.compte.id])).toEqual({
      role: ROLE_ADMIN,
      actif: true,
    });
  });

  it("refusent un changement de rôle sans connexion récente, en disant de se reconnecter et en le proposant : un cookie volé ne change aucun rôle (audit du 2026-11-09)", async () => {
    const issue = await inviter("cible@client.example", AUTRE_ROLE, null);
    if ("erreur" in issue) throw new Error(issue.erreur);
    jouerLaConnexion("ancienne");
    expect(await changerRoleAction(issue.compte.id, ROLE_ADMIN)).toEqual({
      erreur: expect.stringMatching(/reconnectez-vous/),
      reconnexion: "/comptes",
    });
    expect(await queryOne("SELECT role FROM utilisateurs WHERE id = $1", [issue.compte.id])).toEqual({
      role: AUTRE_ROLE,
    });
  });

  it("refusent une invitation sans connexion récente, et ne créent aucun compte : un cookie volé invitait sa propre adresse en admin (audit du 2026-11-09)", async () => {
    jouerLaConnexion("ancienne");
    expect(await inviterAction("intrus@client.example", ROLE_ADMIN, false)).toEqual({
      erreur: expect.stringMatching(/reconnectez-vous/),
      reconnexion: "/comptes",
    });
    expect(await queryOne("SELECT 1 FROM utilisateurs WHERE email = 'intrus@client.example'")).toBeUndefined();
  });

  it("répondent « introuvable » à un id posté qui n'est pas un entier de la base, sans page d'erreur", async () => {
    for (const id of ["1", 1.5, 2 ** 40, null]) {
      expect(await desactiverAction(id), String(id)).toEqual({ erreur: expect.stringMatching(/introuvable/) });
    }
  });

  it("invitent en prévenant par un lien vers /connexion de l'adresse publique, et le disent", async () => {
    vi.stubEnv("URL_PUBLIQUE", "https://appli.example");
    expect(await inviterAction("nouvelle@client.example", AUTRE_ROLE, true)).toEqual({
      message: expect.stringContaining("mail d'information est parti"),
    });
    expect(mailsCaptures()[0].texte).toContain("https://appli.example/connexion");
  });

  it("n'envoient rien quand la case « Prévenir » est décochée, et rappellent de prévenir la personne", async () => {
    expect(await inviterAction("nouvelle@client.example", AUTRE_ROLE, false)).toEqual({
      message: expect.stringContaining("prévenez la personne"),
    });
    expect(mailsCaptures()).toEqual([]);
  });
});

// Brique journal : qui a donné le rôle d'administration à qui, et quand. Les
// gestes passent par les actions, comme depuis l'écran : la personne que rend
// le garde devient l'auteur de la trace. Un geste et sa trace se font dans la
// même transaction, ensemble ou pas du tout.
const lignes = async () =>
  (await lireJournal()).reverse().map(({ auteur, action, entite, entite_id, libelle, champs }) => ({
    auteur,
    action,
    entite,
    entite_id,
    libelle,
    champs,
  }));

async function compteEnBase(email: string, role: string, gereParLAppli = false): Promise<number> {
  const ligne = await queryOne<{ id: number }>(
    "INSERT INTO utilisateurs (email, role, gere_par_l_appli) VALUES ($1, $2, $3) RETURNING id",
    [email, role, gereParLAppli]
  );
  return ligne!.id;
}

describe("journal de l'administration des comptes", () => {
  it("trace chaque geste, au nom de la personne que le garde a rendue, et désigne un compte par son numéro, jamais par son adresse", async () => {
    const auteur = personneJouee()!.email;
    await compteEnBase("chef@client.example", ROLE_ADMIN, true);
    const niveau2 = await compteEnBase("ancien@client.example", AUTRE_ROLE);

    await inviterAction("nouvelle@client.example", AUTRE_ROLE, false);
    const { id } = (await queryOne<{ id: number }>(
      "SELECT id FROM utilisateurs WHERE email = 'nouvelle@client.example'"
    ))!;
    await changerRoleAction(id, ROLE_ADMIN);
    await changerRoleAction(niveau2, ROLE_ADMIN);
    await desactiverAction(id);
    await reactiverAction(id);
    await ouvrirDomaineAction("client.example");
    await fermerDomaineAction("client.example");
    await ouvrirDomaineAction("client.example");

    const compte = (n: number) => ({ auteur, entite: "compte", entite_id: String(n), libelle: `compte n°${n}` });
    const domaine = { auteur, entite: "domaine", entite_id: "client.example", libelle: "client.example" };
    expect(await lignes()).toEqual([
      { ...compte(id), action: "creation", champs: [] },
      { ...compte(id), action: "modification", champs: ["role"] },
      // Un compte du niveau 2 passe géré par l'appli : la configuration ne
      // s'applique plus à lui, et le journal le dit.
      { ...compte(niveau2), action: "modification", champs: ["role", "gere_par_l_appli"] },
      { ...compte(id), action: "modification", champs: ["actif"] },
      { ...compte(id), action: "modification", champs: ["actif"] },
      { ...domaine, action: "creation", champs: [] },
      { ...domaine, action: "modification", champs: ["actif"] },
      // Rouvrir un domaine fermé le modifie : la ligne existait déjà.
      { ...domaine, action: "modification", champs: ["actif"] },
    ]);
  });

  it("n'écrit aucune trace pour un geste refusé : dernier admin, domaine invalide ou public, adresse déjà invitée, compte introuvable", async () => {
    const chef = await compteEnBase("chef@client.example", ROLE_ADMIN, true);

    expect(await desactiverAction(chef)).toHaveProperty("erreur");
    expect(await changerRoleAction(chef, AUTRE_ROLE)).toHaveProperty("erreur");
    expect(await changerRoleAction(chef, "superadmin")).toHaveProperty("erreur");
    expect(await reactiverAction(999_999)).toHaveProperty("erreur");
    expect(await inviterAction("chef@client.example", AUTRE_ROLE, false)).toHaveProperty("erreur");
    expect(await inviterAction("pas une adresse", AUTRE_ROLE, false)).toHaveProperty("erreur");
    expect(await ouvrirDomaineAction("client..example")).toHaveProperty("erreur");
    expect(await ouvrirDomaineAction("gmail.com")).toHaveProperty("erreur");
    expect(await fermerDomaineAction("jamais.example")).toHaveProperty("erreur");

    expect(await lignes()).toEqual([]);
  });

  it("n'écrit aucune trace pour un geste qui ne change rien : réactiver un compte actif, rouvrir un domaine ouvert, redonner le même rôle", async () => {
    await compteEnBase("chef@client.example", ROLE_ADMIN, true);
    const gere = await compteEnBase("gere@client.example", AUTRE_ROLE, true);
    await query("INSERT INTO domaines_admis (domaine) VALUES ('client.example')");

    expect(await reactiverAction(gere)).toEqual({});
    expect(await changerRoleAction(gere, AUTRE_ROLE)).toEqual({});
    expect(await ouvrirDomaineAction("client.example")).toEqual({});

    expect(await lignes()).toEqual([]);
  });

  it("ne fait aucun geste dont la trace échoue : sans compte en base pour l'auteur, rien ne change et aucun mail ne part", async () => {
    const chef = await compteEnBase("chef@client.example", ROLE_ADMIN, true);
    const cible = await compteEnBase("cible@client.example", AUTRE_ROLE, true);
    await query("INSERT INTO domaines_admis (domaine) VALUES ('ouvert.example')");
    await query("DELETE FROM utilisateurs WHERE email = $1", [personneJouee()!.email]);

    await expect(inviterAction("nouvelle@client.example", AUTRE_ROLE, true)).rejects.toThrow(/Brique journal/);
    await expect(changerRoleAction(cible, ROLE_ADMIN)).rejects.toThrow(/Brique journal/);
    await expect(desactiverAction(cible)).rejects.toThrow(/Brique journal/);
    await expect(ouvrirDomaineAction("client.example")).rejects.toThrow(/Brique journal/);
    await expect(fermerDomaineAction("ouvert.example")).rejects.toThrow(/Brique journal/);
    await query("UPDATE utilisateurs SET actif = false WHERE id = $1", [cible]);
    await expect(reactiverAction(cible)).rejects.toThrow(/Brique journal/);

    expect(await query("SELECT id, role, actif FROM utilisateurs ORDER BY id")).toEqual([
      { id: chef, role: ROLE_ADMIN, actif: true },
      { id: cible, role: AUTRE_ROLE, actif: false },
    ]);
    expect(await query("SELECT domaine, actif FROM domaines_admis")).toEqual([
      { domaine: "ouvert.example", actif: true },
    ]);
    expect(mailsCaptures()).toEqual([]);
    expect(await lignes()).toEqual([]);
  });
});
// Fin de la brique journal.
