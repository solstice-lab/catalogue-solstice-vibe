import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "../src/lib/db/client";
import { mailsCaptures, viderMailsCaptures } from "@/briques/mails/envoi";
import type { Notification } from "@/briques/notifications/envoi";
import { routeNotifications } from "@/briques/notifications/route";

/*
 * Brique notifications : la route que la tâche planifiée appelle chaque jour.
 * Frontières réglées : l'horloge (vi.setSystemTime) et l'environnement
 * (vi.stubEnv). Le journal s'écrit dans la vraie base locale, sous la source
 * « test-notifications-route », effacée avant et après chaque cas.
 */

const SOURCE = "test-notifications-route";
const SECRET = "secret-de-la-route-pour-les-tests-0123456789";
const ESSAI = "equipe.essai@exemple.test";
// Lundi 26 octobre 2026, 9 h à Paris ; le mardi qui suit.
const LUNDI = new Date("2026-10-26T08:00:00Z");
const MARDI = new Date("2026-10-27T08:00:00Z");

const fabrique = vi.fn(async (aujourdhui: string): Promise<Notification[]> => [
  { a: "responsable@exemple.test", objet: `Récapitulatif du ${aujourdhui}`, contenu: [{ paragraphe: "CT-1" }] },
  { a: null, objet: "Sans responsable", contenu: [{ paragraphe: "CT-2" }] },
]);

const route = routeNotifications({ source: SOURCE, jours: ["lundi"], fabriquer: fabrique });

function requete(options: { secret?: string | null; corps?: unknown; url?: string } = {}): Request {
  const { secret = SECRET, corps, url = "https://appli.exemple.test/api/notifications/test" } = options;
  const entetes: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) entetes.Authorization = `Bearer ${secret}`;
  return new Request(url, {
    method: "POST",
    headers: entetes,
    body: corps === undefined ? undefined : typeof corps === "string" ? corps : JSON.stringify(corps),
  });
}

async function lignesDuJournal(): Promise<number> {
  const lignes = await query(`SELECT 1 FROM notifications_envois WHERE source = $1`, [SOURCE]);
  return lignes.length;
}

beforeEach(async () => {
  viderMailsCaptures();
  fabrique.mockClear();
  await query(`DELETE FROM notifications_envois WHERE source = $1`, [SOURCE]);
  await query(`DELETE FROM notifications_lancements WHERE source = $1`, [SOURCE]);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(LUNDI);
  vi.stubEnv("NOTIFICATIONS_SECRET", SECRET);
  vi.stubEnv("NOTIFICATIONS_ADRESSES_ESSAI", ESSAI);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await query(`DELETE FROM notifications_envois WHERE source = $1`, [SOURCE]);
  await query(`DELETE FROM notifications_lancements WHERE source = $1`, [SOURCE]);
});

describe("brique notifications : la route protégée par son secret", () => {
  it.each([
    ["sans en-tête", null],
    ["avec un mauvais secret", "pas-le-bon"],
    ["avec un secret de longueur différente", `${SECRET}-et-plus`],
    ["avec un secret vide", ""],
  ])("sans le bon secret (%s), la route répond 401 et n'envoie rien", async (_cas, secret) => {
    const reponse = await route(requete({ secret }));

    expect(reponse.status).toBe(401);
    expect(fabrique).not.toHaveBeenCalled();
    expect(mailsCaptures()).toEqual([]);
    expect(await lignesDuJournal()).toBe(0);
  });

  it("sans secret configuré chez l'hébergeur, la route répond 401 à tous, même à un en-tête vide", async () => {
    vi.stubEnv("NOTIFICATIONS_SECRET", "");
    expect((await route(requete({ secret: "" }))).status).toBe(401);
    expect((await route(requete({ secret: "undefined" }))).status).toBe(401);
    expect(fabrique).not.toHaveBeenCalled();
  });
});

describe("brique notifications : la route décide du jour", () => {
  it("un jour d'envoi, fabrique les notifications de la date du client, les envoie, et répond par des comptes sans adresse", async () => {
    const reponse = await route(requete());

    expect(reponse.status).toBe(200);
    const corps = await reponse.json();
    expect(corps).toMatchObject({
      envoye: true,
      aujourdhui: "2026-10-26",
      mode: "reel",
      envoyes: 1,
      sansDestinataire: 1,
    });
    expect(fabrique).toHaveBeenCalledWith("2026-10-26");
    expect(mailsCaptures().map((mail) => mail.a)).toEqual(["responsable@exemple.test"]);
    expect(JSON.stringify(corps)).not.toContain("@");
  });

  it("un autre jour, ne fabrique rien et n'envoie rien", async () => {
    vi.setSystemTime(MARDI);
    const corps = await (await route(requete())).json();

    expect(corps).toMatchObject({ envoye: false, aujourdhui: "2026-10-27" });
    expect(fabrique).not.toHaveBeenCalled();
    expect(mailsCaptures()).toEqual([]);
  });

  it("le jour se lit dans le fuseau du client : dimanche 23 h 30 UTC est déjà lundi à Paris", async () => {
    vi.setSystemTime(new Date("2026-10-25T23:30:00Z"));
    const corps = await (await route(requete())).json();

    expect(corps).toMatchObject({ envoye: true, aujourdhui: "2026-10-26" });
  });

  it("un deuxième appel réel le même jour n'envoie rien (une tâche relancée renverrait le récapitulatif à tout le monde)", async () => {
    await route(requete());
    viderMailsCaptures();
    fabrique.mockClear();

    const corps = await (await route(requete())).json();

    expect(corps).toMatchObject({ envoye: false, raison: "Déjà lancé aujourd'hui." });
    expect(mailsCaptures()).toEqual([]);
  });

  it("deux appels réels simultanés le même jour n'envoient qu'une fois (la tâche planifiée et une relance à la main)", async () => {
    const reponses = await Promise.all([route(requete()), route(requete()), route(requete())]);
    const corps = await Promise.all(reponses.map((reponse) => reponse.json()));

    expect(corps.filter((un) => un.envoye === true)).toHaveLength(1);
    expect(mailsCaptures().map((mail) => mail.a)).toEqual(["responsable@exemple.test"]);
  });

  it("un jour dont tous les envois ont échoué reste servi : la tâche l'a signalé, le récapitulatif suivant rattrape", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAILS_FOURNISSEUR", "");
    const premier = await (await route(requete())).json();
    expect(premier).toMatchObject({ envoye: true, envoyes: 0, echecs: 1 });

    const second = await (await route(requete())).json();
    expect(second).toMatchObject({ envoye: false, raison: "Déjà lancé aujourd'hui." });
  });

  it("une route mal réglée échoue dès sa création, pas à chaque appel de la tâche planifiée", () => {
    expect(() => routeNotifications({ source: "Contrats !", jours: ["lundi"], fabriquer: fabrique })).toThrow(
      /^Brique notifications : /
    );
    expect(() =>
      routeNotifications({ source: "contrats", jours: ["lundi"], fabriquer: fabrique, conservationMois: 0 })
    ).toThrow(/^Brique notifications : /);
  });
});

describe("brique notifications : les modes de la route", () => {
  it("le mode à blanc, demandé dans le corps, répond la liste sans rien envoyer, quel que soit le jour", async () => {
    vi.setSystemTime(MARDI);
    const corps = await (await route(requete({ corps: { mode: "a-blanc" } }))).json();

    expect(corps).toMatchObject({ envoye: false, mode: "a-blanc" });
    expect(corps.lignes).toEqual([
      expect.objectContaining({ a: "responsable@exemple.test", resultat: "prevu" }),
      expect.objectContaining({ a: null, resultat: "sans-destinataire" }),
    ]);
    expect(mailsCaptures()).toEqual([]);
    expect(await lignesDuJournal()).toBe(0);
  });

  it("le mode essai, demandé dans le corps, n'écrit qu'à l'adresse permise, quel que soit le jour", async () => {
    vi.setSystemTime(MARDI);
    const reponse = await route(requete({ corps: { mode: "essai", a: ESSAI } }));

    expect(reponse.status).toBe(200);
    expect(mailsCaptures().map((mail) => mail.a)).toEqual([ESSAI]);
  });

  it("refuse une adresse d'essai hors de la liste permise par un 400, sans rien envoyer", async () => {
    const reponse = await route(requete({ corps: { mode: "essai", a: "inconnu@exemple.test" } }));

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toMatch(/^Brique notifications : /);
    expect(mailsCaptures()).toEqual([]);
    expect(await lignesDuJournal()).toBe(0);
  });

  it.each([
    ["un mode inconnu", { mode: "tout-de-suite" }],
    ["un essai sans adresse", { mode: "essai" }],
    ["un corps qui n'est pas du JSON", "mode=a-blanc"],
    // Une répétition mal tapée, lue comme un mode réel, partirait pour de vrai.
    ["un corps qui ne nomme pas son mode", { a: ESSAI }],
    ["un mode mal orthographié", { Mode: "a-blanc" }],
    ["un corps JSON null", "null"],
    ["un tableau", "[]"],
    ["une chaîne JSON", '"a-blanc"'],
  ])("refuse %s par un 400, sans rien envoyer ni fabriquer", async (_cas, corps) => {
    const reponse = await route(requete({ corps }));

    expect(reponse.status).toBe(400);
    expect(fabrique).not.toHaveBeenCalled();
    expect(mailsCaptures()).toEqual([]);
  });

  it("le mode et l'adresse d'essai se lisent dans le corps de la requête, jamais dans l'URL : une URL qui en porte est refusée", async () => {
    // Lue comme un mode réel, cette requête aurait envoyé pour de vrai ; et
    // l'adresse serait restée dans les journaux d'accès de l'hébergeur.
    const reponse = await route(
      requete({ url: `https://appli.exemple.test/api/notifications/test?mode=essai&a=${ESSAI}` })
    );

    expect(reponse.status).toBe(400);
    expect(fabrique).not.toHaveBeenCalled();
    expect(mailsCaptures()).toEqual([]);
  });
});
