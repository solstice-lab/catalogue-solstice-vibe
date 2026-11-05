import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query, transaction } from "../src/lib/db/client";
import { mailsCaptures, viderMailsCaptures } from "@/briques/mails/envoi";
import {
  CONSERVATION_MOIS_PAR_DEFAUT,
  envoyerNotifications,
  ErreurNotifications,
  type Notification,
} from "@/briques/notifications/envoi";
import { SOURCES_NOTIFICATIONS } from "@/briques/notifications/donnees-personnelles";
import { TRAITEMENTS_NOTIFICATIONS } from "@/briques/notifications/confidentialite";

/*
 * Brique notifications : la boucle d'envoi et son journal. Seule frontière
 * réglée : l'environnement de la brique mails (vi.stubEnv), qui capture tout
 * en test et échoue sans clé quand le test joue la production. Le journal
 * s'écrit dans la vraie base locale.
 *
 * Les lignes de ces tests portent la source « test-notifications », effacée
 * avant et après chaque cas : la base de test est partagée avec les autres
 * fichiers.
 */

const SOURCE = "test-notifications";
const ESSAI = "equipe.essai@exemple.test";

function notification(a: string | null, objet = "Contrats à échéance"): Notification {
  return { a, objet, contenu: [{ paragraphe: "Le contrat CT-1 se termine le 2026-11-20." }] };
}

type LigneJournal = {
  destinataire: string | null;
  objet: string;
  mode: string;
  resultat: string;
  erreur: string | null;
};

async function journal(): Promise<LigneJournal[]> {
  return query<LigneJournal>(
    `SELECT destinataire, objet, mode, resultat, erreur FROM notifications_envois WHERE source = $1 ORDER BY id`,
    [SOURCE]
  );
}

async function nettoyer() {
  await query(`DELETE FROM notifications_envois WHERE source = $1`, [SOURCE]);
}

beforeEach(async () => {
  viderMailsCaptures();
  await nettoyer();
  vi.stubEnv("NOTIFICATIONS_ADRESSES_ESSAI", `autre@exemple.test, ${ESSAI.toUpperCase()}`);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await nettoyer();
});

describe("brique notifications : la boucle d'envoi", () => {
  it("chaque envoi, réussi ou non, laisse une ligne au journal (projet précédent : aucune trace des envois)", async () => {
    const rapport = await envoyerNotifications(
      [notification(" Responsable.Un@Exemple.test "), notification("pas-une-adresse"), notification(null)],
      { mode: "reel", source: SOURCE }
    );

    expect(rapport).toMatchObject({ mode: "reel", envoyes: 1, echecs: 1, sansDestinataire: 1 });
    expect(await journal()).toEqual([
      {
        destinataire: "responsable.un@exemple.test",
        objet: "Contrats à échéance",
        mode: "reel",
        resultat: "envoye",
        erreur: null,
      },
      expect.objectContaining({
        destinataire: "pas-une-adresse",
        resultat: "echec",
        erreur: expect.stringMatching(/^Brique mails : /),
      }),
      expect.objectContaining({ destinataire: null, resultat: "sans-destinataire" }),
    ]);
  });

  // La contrainte du journal compare l'adresse à lower(btrim(...)) de Postgres ;
  // la brique l'écrit après toLowerCase() de Node. Si les deux minuscules
  // divergent (collation de la base, lettres à plusieurs formes), l'INSERT est
  // refusé APRÈS l'envoi et la boucle s'arrête : cas relevé à la relecture de
  // l'ajout de la brique à tours-de-coloc, jamais rencontré en vrai. Constat du
  // 2026-11-05 : la base de test est en collation en_US.utf8 (pas C), donc
  // lower() y connaît les lettres accentuées, et aucun de ces cas ne diverge.
  // Rejoué à la main en collation C (lower(x) collate "C"), il passe aussi :
  // la valeur arrive déjà en minuscules, que lower() laisse alors inchangée.
  // Ce que le test ne couvre PAS : une autre collation que ces deux-là (celle
  // de l'hébergeur). Si un cas casse un jour, normaliser côté Node avant
  // l'écriture (jamais retoucher le CREATE TABLE).
  it.each([
    ["une majuscule accentuée", " Économat.Général@Exemple.test ", "économat.général@exemple.test"],
    [
      "un i majuscule pointé (İ, deux points de code en minuscules)",
      "İstanbul.Contact@Exemple.test",
      "i̇stanbul.contact@exemple.test",
    ],
    ["un sigma majuscule final (Σ devient ς en fin de mot)", "ΑΣ@Exemple.test", "ας@exemple.test"],
    ["un ß majuscule (ẞ)", "STRAẞE@Exemple.test", "straße@exemple.test"],
  ])(
    "une adresse avec %s traverse l'insertion au journal, rangée en minuscules (contrainte lower/btrim de la base)",
    async (_cas, adresse, rangee) => {
      await envoyerNotifications([notification(adresse), notification("apres@exemple.test")], {
        mode: "reel",
        source: SOURCE,
      });

      const lignes = await journal();
      expect(lignes.map((ligne) => ligne.destinataire)).toEqual([rangee, "apres@exemple.test"]);
    }
  );

  it("l'échec d'envoi à une personne ne bloque ni les suivantes ni le reste du traitement", async () => {
    const rapport = await envoyerNotifications(
      [notification("un@exemple.test"), notification("pas-une-adresse"), notification("deux@exemple.test")],
      { mode: "reel", source: SOURCE }
    );

    expect(rapport).toMatchObject({ envoyes: 2, echecs: 1 });
    expect(mailsCaptures().map((mail) => mail.a)).toEqual(["un@exemple.test", "deux@exemple.test"]);
  });

  it("une adresse absente ou vide est journalisée et n'arrête pas la boucle", async () => {
    const rapport = await envoyerNotifications(
      [notification(null), notification("   "), notification("un@exemple.test")],
      { mode: "reel", source: SOURCE }
    );

    expect(rapport).toMatchObject({ envoyes: 1, sansDestinataire: 2 });
    expect((await journal()).map((ligne) => ligne.resultat)).toEqual([
      "sans-destinataire",
      "sans-destinataire",
      "envoye",
    ]);
    expect(mailsCaptures()).toHaveLength(1);
  });

  it("sans clé d'envoi, l'envoi échoue explicitement : jamais un succès silencieux", async () => {
    // La production sans réglage de la brique mails : elle refuse d'envoyer.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAILS_FOURNISSEUR", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAILS_EXPEDITEUR", "Mon appli <ne-pas-repondre@exemple.fr>");

    const rapport = await envoyerNotifications([notification("un@exemple.test")], { mode: "reel", source: SOURCE });

    expect(rapport).toMatchObject({ envoyes: 0, echecs: 1 });
    expect(await journal()).toEqual([
      expect.objectContaining({ resultat: "echec", erreur: expect.stringContaining("RESEND_API_KEY") }),
    ]);
  });

  it("un objet contenant du HTML s'affiche tel quel dans le mail, sans lien injecté (cas d'un nom inséré tel quel dans le HTML)", async () => {
    await envoyerNotifications(
      [
        {
          a: "un@exemple.test",
          objet: `Contrat <a href="https://piege.exemple">CT-1</a>`,
          contenu: [{ paragraphe: `Objet : <script>alert(1)</script> <a href="https://piege.exemple">ici</a>` }],
        },
      ],
      { mode: "reel", source: SOURCE }
    );

    const [mail] = mailsCaptures();
    expect(mail.objet).toBe(`Contrat <a href="https://piege.exemple">CT-1</a>`);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain('href="https://piege.exemple"');
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("en mode réel, le rapport ne contient aucune adresse : seulement des comptes", async () => {
    const rapport = await envoyerNotifications([notification("un@exemple.test"), notification("pas-une-adresse")], {
      mode: "reel",
      source: SOURCE,
    });

    expect(JSON.stringify(rapport)).not.toMatch(/exemple\.test|pas-une-adresse/);
    expect(rapport).not.toHaveProperty("lignes");
  });
});

describe("brique notifications : les modes de répétition", () => {
  it("le mode à blanc n'envoie rien, n'écrit rien et liste ce qu'il enverrait", async () => {
    const rapport = await envoyerNotifications([notification("un@exemple.test"), notification(null)], {
      mode: "a-blanc",
      source: SOURCE,
    });

    expect(mailsCaptures()).toEqual([]);
    expect(await journal()).toEqual([]);
    expect(rapport).toMatchObject({
      mode: "a-blanc",
      envoyes: 0,
      sansDestinataire: 1,
      lignes: [
        { a: "un@exemple.test", objet: "Contrats à échéance", resultat: "prevu", erreur: null },
        { a: null, objet: "Contrats à échéance", resultat: "sans-destinataire", erreur: null },
      ],
    });
  });

  it("le mode essai n'écrit qu'à l'adresse donnée, et nomme dans le mail le destinataire prévu", async () => {
    const rapport = await envoyerNotifications([notification("un@exemple.test"), notification("deux@exemple.test")], {
      mode: "essai",
      a: ESSAI,
      source: SOURCE,
    });

    expect(mailsCaptures().map((mail) => mail.a)).toEqual([ESSAI, ESSAI]);
    expect(mailsCaptures()[0].texte).toContain("un@exemple.test");
    expect(rapport).toMatchObject({ mode: "essai", envoyes: 2 });
    // Le journal garde l'adresse qui a reçu le mail.
    expect((await journal()).map((ligne) => [ligne.destinataire, ligne.mode])).toEqual([
      [ESSAI, "essai"],
      [ESSAI, "essai"],
    ]);
  });

  it("le mode essai refuse une adresse hors de la liste permise, avant tout envoi (sinon le secret suffit pour écrire à n'importe qui)", async () => {
    const essai = envoyerNotifications([notification("un@exemple.test")], {
      mode: "essai",
      a: "inconnu@exemple.test",
      source: SOURCE,
    });

    await expect(essai).rejects.toThrow(ErreurNotifications);
    await expect(essai).rejects.toThrow(/^Brique notifications : /);
    expect(mailsCaptures()).toEqual([]);
    expect(await journal()).toEqual([]);
  });

  it("sans liste d'adresses permises, le mode essai refuse tout", async () => {
    vi.stubEnv("NOTIFICATIONS_ADRESSES_ESSAI", "");
    await expect(
      envoyerNotifications([notification("un@exemple.test")], { mode: "essai", a: ESSAI, source: SOURCE })
    ).rejects.toThrow(ErreurNotifications);
    expect(mailsCaptures()).toEqual([]);
  });
});

describe("brique notifications : conservation et données personnelles", () => {
  it("efface, à chaque envoi, les lignes plus anciennes que la durée de conservation, et garde les autres", async () => {
    await query(
      `INSERT INTO notifications_envois (envoye_le, jour, source, mode, destinataire, objet, resultat)
       VALUES (now() - interval '13 months', (now() - interval '13 months')::date, $1, 'reel', 'ancien@exemple.test', 'Ancien', 'envoye'),
              (now() - interval '11 months', (now() - interval '11 months')::date, $1, 'reel', 'recent@exemple.test', 'Récent', 'envoye')`,
      [SOURCE]
    );

    await envoyerNotifications([notification("un@exemple.test")], { mode: "reel", source: SOURCE });

    expect((await journal()).map((ligne) => ligne.objet)).toEqual(["Récent", "Contrats à échéance"]);
  });

  it("le mode à blanc n'efface rien : il n'écrit pas", async () => {
    await query(
      `INSERT INTO notifications_envois (envoye_le, jour, source, mode, destinataire, objet, resultat)
       VALUES (now() - interval '13 months', (now() - interval '13 months')::date, $1, 'reel', 'ancien@exemple.test', 'Ancien', 'envoye')`,
      [SOURCE]
    );
    await envoyerNotifications([notification("un@exemple.test")], { mode: "a-blanc", source: SOURCE });
    expect(await journal()).toHaveLength(1);
  });

  it("refuse une durée de conservation qui n'est pas un entier d'au moins un mois", async () => {
    await expect(envoyerNotifications([], { mode: "reel", source: SOURCE, conservationMois: 0 })).rejects.toThrow(
      ErreurNotifications
    );
  });

  it("l'export des données d'une personne sort les notifications qui lui ont été adressées, et pas celles d'une autre", async () => {
    await envoyerNotifications([notification("Elle@Exemple.test"), notification("autre@exemple.test", "Autre")], {
      mode: "reel",
      source: SOURCE,
    });

    const [source] = SOURCES_NOTIFICATIONS;
    expect(source.tables).toEqual(["notifications_envois"]);
    const lignes = (await source.lire("elle@exemple.test")).filter((ligne) => ligne.source === SOURCE);
    expect(lignes).toEqual([expect.objectContaining({ objet: "Contrats à échéance", resultat: "envoye" })]);
    expect(lignes[0]).not.toHaveProperty("id");
  });

  // L'effacement des données d'une personne (brique rgpd) garde la ligne,
  // trace d'un envoi, et n'y laisse plus l'adresse. Sans effacer, la source
  // ne compilait plus dans une appli qui a la brique rgpd.
  it("l'effacement des données d'une personne retire son adresse des envois, et garde leurs lignes", async () => {
    const ELLE = "notification.effacee@exemple.test";
    await envoyerNotifications([notification(ELLE.toUpperCase()), notification("autre@exemple.test", "Autre")], {
      mode: "reel",
      source: SOURCE,
    });

    const issue = await transaction((tx) => SOURCES_NOTIFICATIONS[0].effacer(tx, ELLE));

    expect(issue).toEqual({ lignes: 1 });
    expect(await journal()).toEqual([
      expect.objectContaining({ destinataire: null, objet: "Contrats à échéance", resultat: "envoye" }),
      expect.objectContaining({ destinataire: "autre@exemple.test", objet: "Autre" }),
    ]);
  });

  // Seule la normalisation de envoi.ts tient ces règles côté code : la base les
  // tient aussi, pour un script qui écrirait le journal à la main.
  it.each([
    ["un mode inconnu", "'a-blanc'", "'envoye'", "'un@exemple.test'"],
    ["un résultat inconnu", "'reel'", "'parti'", "'un@exemple.test'"],
    ["un destinataire en majuscules", "'reel'", "'envoye'", "'Un@Exemple.test'"],
    ["un destinataire entouré d'espaces", "'reel'", "'envoye'", "' un@exemple.test'"],
  ])("la base refuse %s au journal", async (_cas, mode, resultat, destinataire) => {
    await expect(
      query(
        `INSERT INTO notifications_envois (jour, source, mode, destinataire, objet, resultat)
         VALUES (current_date, $1, ${mode}, ${destinataire}, 'Objet', ${resultat})`,
        [SOURCE]
      )
    ).rejects.toThrow(/notifications_envois_(mode|resultat|destinataire)_check/);
  });

  // La durée déclarée est celle que la route applique par défaut : la
  // politique annonce ce que le code fait. La base légale reste au client.
  it("décrit son traitement pour la politique de confidentialité, avec la durée que la route applique, sans base légale (choix du client)", () => {
    expect(TRAITEMENTS_NOTIFICATIONS.map((traitement) => traitement.cle)).toEqual(["notifications"]);
    expect(JSON.stringify(TRAITEMENTS_NOTIFICATIONS)).not.toMatch(/baseLegale/);
    expect(TRAITEMENTS_NOTIFICATIONS[0].conservation).toEqual([
      expect.objectContaining({ duree: { mois: CONSERVATION_MOIS_PAR_DEFAUT } }),
    ]);
  });
});
