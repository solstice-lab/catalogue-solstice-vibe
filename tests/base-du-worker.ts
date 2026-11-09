/*
 * Premier des setupFiles : fait pointer ce worker sur sa propre base,
 * <base de test>_w<n>, que tests/bases-des-workers.ts a créée. Il tourne
 * avant le fichier de test et ses imports, donc avant la première requête :
 * le pool de src/lib/db/client.ts lit DATABASE_URL à ce moment-là.
 *
 * Dérivée de l'URL que le globalSetup a reçue, pas de DATABASE_URL : un
 * worker qui enchaîne plusieurs fichiers dans le même processus la trouverait
 * déjà réécrite.
 */
import { inject } from "vitest";
import { baseDuWorker } from "../scripts/lib/bases-locales";

const adresse = new URL(inject("urlDeLaBaseDeTest"));
const base = decodeURIComponent(adresse.pathname.slice(1));
adresse.pathname = `/${encodeURIComponent(baseDuWorker(base, Number(process.env.VITEST_POOL_ID)))}`;
process.env.DATABASE_URL = adresse.toString();
