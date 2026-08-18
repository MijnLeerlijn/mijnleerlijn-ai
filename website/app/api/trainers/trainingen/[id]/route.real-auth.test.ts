// @vitest-environment node
//
// Deze testfile heeft géén DOM nodig en moet in Node's eigen realm draaien:
// het standaard jsdom-environment van dit project (vitest.config.ts) gaf
// hier "TypeError: payload must be an instance of Uint8Array" uit Payload's
// eigen jwtSign (via jose se SignJWT) — een bekende klasse jsdom-vs-Node-
// realmmismatch (TextEncoder().encode(...) levert in jsdom een Uint8Array op
// uit een ANDER realm dan de "instanceof Uint8Array"-check elders in
// dezelfde jose-module verwacht). Live bevestigd: dezelfde test slaagt wél
// onder dit @vitest-environment node-commentaar. Geen enkele andere test in
// dit project raakte dit eerder, omdat dit de eerste is die een echte
// payload.login()/JWT-ondertekening uitvoert i.p.v. alles rond auth te
// mocken.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { SignJWT, decodeJwt } from "jose";
import type { Payload } from "payload";
import { mondayQuery, haalScholenPagina, leesKolomWaarden } from "@/lib/sales/monday-client";
import { UITVOERING_BOARD_ID } from "@/lib/trainers/monday-links";

// Ronde 2, vervolg (2026-08-19) — sluit het diagnostische gat rond Wessels
// productiemelding "Niet ingelogd.". route.test.ts mockt verifyTrainerSessionCookie
// zelf (bewuste keuze daar — bewaakt uitsluitend de HTTP-laag: validatie,
// rate limiting, uitkomst-vertaling). DIT bestand doet het tegenovergestelde:
// een ECHTE Payload-boot + ECHTE Postgres + ECHTE, door Payload's eigen
// loginOperation ondertekende JWT-cookies, exact zoals productie ze uitgeeft
// via /api/trainer-accounts/login — enige mock is de Monday-transportlaag
// (@/lib/sales/monday-client), zoals opgedragen. Zelfde bewezen patroon als
// payload/migrations/__tests__/20260819_110000_trainer_accounts_system_rels_fix.test.ts
// (scratch-database + echte "payload migrate"-CLI + describe.skipIf zonder
// bereikbare Postgres) — nodig omdat de vraag hier zelf over Payload's eigen
// auth-/sessiemachinerie gaat (JWT-collection-claim, sessions-array,
// gedeelde cookienaam), niet iets dat op functieniveau alleen te simuleren is.
//
// Dekt de 5 scenario's die zich leggen tegen een echte HTTP-achtige PATCH-
// aanroep laten toetsen: (1) geen cookie, (2) een echte admin/users-sessie,
// (3) een JWT met een bewust verkeerde collection-claim, (4) een geldige
// trainer-accounts-sessie, (5) cross-trainer-isolatie via het echte authpad.
// Het zesde, expliciet gevraagde scenario ("subdomein trainers.* — wordt de
// cookie daadwerkelijk meegestuurd?") is bewust GEEN onderdeel van dit
// bestand: dat is een vraag over echt browser-cookiegedrag (Domain/Path-
// scoping tijdens een cross-subdomeinnavigatie), niet iets een handmatig
// samengestelde NextRequest kan aantonen — hiervoor blijft de bestaande,
// ad-hoc Playwright-aanpak van dit project leidend (zie opleverrapport), geen
// gecommitte suite.
const TEST_DATABASE_URI =
  process.env.TRAINER_AUTH_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_trainer_auth_diagnose_test";

// Master Data-board-ID — privé in lib/trainers/monday-links.ts
// (MASTER_DATA_BOARD_ID), hier bewust hetzelfde, live geverifieerde ID
// gedupliceerd (een board-ID is een opaque waarde, geen geheim) zodat de
// haalScholenPagina-mock hieronder op boardId kan onderscheiden welk board
// wordt opgevraagd.
const MASTER_DATA_BOARD_ID = "18420120365";

function vervangDatabasenaam(uri: string, nieuweNaam: string): string {
  const url = new URL(uri);
  url.pathname = `/${nieuweNaam}`;
  return url.toString();
}

// Zelfde noodzaak als in de migratietest hierboven aangehaald:
// payload.db.migrate() rechtstreeks vanuit vitest loopt stuk op Payload's
// eigen dynamicImport()-mechanisme; de echte CLI (via npx, zoals
// build:production dat ook gebruikt) niet.
function draaiPayloadMigrate(databaseUri: string): void {
  execFileSync("npx", ["payload", "migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URI: databaseUri, PAYLOAD_MIGRATING: "true" },
    stdio: "pipe",
  });
}

async function postgresBereikbaar(): Promise<boolean> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URI, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("SELECT 1;");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

// Monday-transport gemockt, zoals opgedragen — de auth-/writeback-/Payload-
// laag blijft overal echt. Alleen de functies die deze tests daadwerkelijk
// raken worden overschreven; de rest komt via importOriginal ongewijzigd door
// (een onbedoelde aanroep van bv. wijzigKolomWaarde faalt dan hard/zichtbaar
// op de ontbrekende MONDAY_API_TOKEN, nooit stil-onjuist).
vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return { ...echt, mondayQuery: vi.fn(), haalScholenPagina: vi.fn(), leesKolomWaarden: vi.fn() };
});

const mockQuery = vi.mocked(mondayQuery);
const mockScholenPagina = vi.mocked(haalScholenPagina);
const mockLeesKolomWaarden = vi.mocked(leesKolomWaarden);

// Zelfde bouwstenen als lib/trainers/security.test.ts — bewust hier
// gedupliceerd i.p.v. geïmporteerd (elk testbestand in dit project is
// zelfstandig leesbaar), zelfde reden.
function linkedPulseIdsValue(ids: (string | number)[]): string {
  return JSON.stringify({ linkedPulseIds: ids.map((linkedPulseId) => ({ linkedPulseId })) });
}

function masterDataItem(opts: { id: string; naam: string; trainerLinkedIds?: (string | number)[] }) {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: "board_relation_mm5r2jy1", text: null, value: opts.trainerLinkedIds ? linkedPulseIdsValue(opts.trainerLinkedIds) : null },
      { id: "board_relation_mm4v8fpm", text: null, value: null },
      { id: "dropdown_mm4v9rvg", text: null, value: null },
      { id: "text_mm5r9kn2", text: null, value: null },
      { id: "color_mm5q790a", text: null, value: null },
    ],
  };
}

function uitvoeringItem(opts: { id: string; naam: string; schoolIds?: (string | number)[] }) {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: "board_relation_mm5tyc40", text: null, value: opts.schoolIds ? linkedPulseIdsValue(opts.schoolIds) : null },
      { id: "color_mm5tz3wk", text: null, value: null },
      { id: "date_mm5tnfvx", text: null, value: null },
      { id: "boolean_mm5tvfc5", text: null, value: null },
    ],
  };
}

function trainerboardBoardsResponse(items: { id: string; name: string; groupTitle?: string | null; masterId?: string | null }[]) {
  return {
    boards: [
      {
        items_page: {
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            group: i.groupTitle !== undefined ? { title: i.groupTitle } : null,
            column_values: [{ id: "numeric_mm5vceeq", text: i.masterId ?? null, value: null }],
          })),
        },
      },
    ],
  };
}

const beschikbaar = await postgresBereikbaar();
const scratchUri = vervangDatabasenaam(TEST_DATABASE_URI, TEST_DB_NAAM);
const oorspronkelijkeDatabaseUri = process.env.DATABASE_URI;
const oorspronkelijkePayloadMigrating = process.env.PAYLOAD_MIGRATING;
const oorspronkelijkeWriteBackVlag = process.env.TRAINER_MONDAY_WRITEBACK_ENABLED;

const WACHTWOORD = "AuthDiagnoseTest#2026!!";

const TRAINER_A_BOARD_ID = "80000000001";
const TRAINER_A_UITVOERDER_ID = "70000000001";
const TRAINER_B_BOARD_ID = "80000000002";
const TRAINER_B_UITVOERDER_ID = "70000000002";
const SCHOOL_VAN_B_ID = "60000000001";
const TRAINING_VAN_B_ID = "50000000001"; // tegelijk de centrale-training-ID én de Master ID op het trainerboard-item
const TRAINERBOARD_ITEM_VAN_B_ID = "40000000001";

describe.skipIf(!beschikbaar)(
  "PATCH /api/trainers/trainingen/[id] — ECHTE sessieverificatie (echte Postgres + echte Payload-boot + echt door Payload ondertekende JWT's)",
  () => {
    let adminPool: Pool;
    let payload: Payload | undefined;
    let getPayload: typeof import("payload").getPayload;
    let config: typeof import("@/payload.config").default;
    let PATCH: (typeof import("./route"))["PATCH"];

    let trainerAToken: string;
    let trainerBToken: string;
    let adminToken: string;
    let verkeerdeCollectieToken: string;

    beforeAll(async () => {
      adminPool = new Pool({ connectionString: TEST_DATABASE_URI });
      await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM};`);
      await adminPool.query(`CREATE DATABASE ${TEST_DB_NAAM};`);

      // payload.config.ts leest DATABASE_URI op importtijd (top-level
      // postgresAdapter({...})) — moet dus al gezet zijn vóórdat de
      // dynamische imports hieronder draaien (zelfde vereiste als de
      // migratietest).
      process.env.DATABASE_URI = scratchUri;
      process.env.PAYLOAD_MIGRATING = "true";
      // Deterministisch: de writeback-gate moet dicht staan, ongeacht wat een
      // lokale .env toevallig zet — scenario 5 se controlecase (trainer B
      // komt voorbij eigendomscontrole) moet altijd op "niet_geactiveerd"
      // uitkomen, nooit een echte (in deze sandbox toch onbereikbare)
      // Monday-mutatiepoging.
      delete process.env.TRAINER_MONDAY_WRITEBACK_ENABLED;

      ({ getPayload } = await import("payload"));
      config = (await import("@/payload.config")).default;
      ({ PATCH } = await import("./route"));

      draaiPayloadMigrate(scratchUri);
      payload = await getPayload({ config, key: "trainer-auth-diagnose" });

      await payload.create({
        collection: "trainer-accounts",
        data: {
          name: "Trainer A (test)",
          email: "trainer-a-authtest@mijnleerlijn.nl",
          password: WACHTWOORD,
          mondayTrainerboardId: TRAINER_A_BOARD_ID,
          mondayUitvoerderItemId: TRAINER_A_UITVOERDER_ID,
          actief: true,
        },
        overrideAccess: true,
      });
      await payload.create({
        collection: "trainer-accounts",
        data: {
          name: "Trainer B (test)",
          email: "trainer-b-authtest@mijnleerlijn.nl",
          password: WACHTWOORD,
          mondayTrainerboardId: TRAINER_B_BOARD_ID,
          mondayUitvoerderItemId: TRAINER_B_UITVOERDER_ID,
          actief: true,
        },
        overrideAccess: true,
      });
      await payload.create({
        collection: "users",
        data: { name: "Admin (test)", email: "admin-authtest@mijnleerlijn.nl", password: WACHTWOORD, role: "admin" },
        overrideAccess: true,
      });

      // Echte logins via Payload's eigen loginOperation (payload.login() —
      // de local-API-tegenhanger van /api/trainer-accounts/login, dezelfde
      // operation, dus dezelfde echte bcrypt-verificatie + echte
      // sessions-array-registratie + echte jwtSign met het echte
      // payload.secret) — geen enkel handmatig samengesteld cookie voor
      // scenario 1/2/4/5.
      const loginA = await payload.login({ collection: "trainer-accounts", data: { email: "trainer-a-authtest@mijnleerlijn.nl", password: WACHTWOORD } });
      const loginB = await payload.login({ collection: "trainer-accounts", data: { email: "trainer-b-authtest@mijnleerlijn.nl", password: WACHTWOORD } });
      const loginAdmin = await payload.login({ collection: "users", data: { email: "admin-authtest@mijnleerlijn.nl", password: WACHTWOORD } });
      if (!loginA.token || !loginB.token || !loginAdmin.token) throw new Error("Verwachtte een token na een geslaagde testlogin.");
      trainerAToken = loginA.token;
      trainerBToken = loginB.token;
      adminToken = loginAdmin.token;

      // Scenario 3 — een hand-samengestelde, WEL geldig ondertekende (met
      // het echte payload.secret) JWT met een bewust foute collection-claim.
      // Dit is nooit iets dat Payload's eigen loginOperation zelf kan
      // produceren (die geeft altijd letterlijk "trainer-accounts" of
      // "users") — isoleert de collection-gelijkheidscontrole in
      // lib/trainers/auth.ts zelf, los van of "users" toevallig de enige
      // andere bestaande collectie is.
      const echteClaims = decodeJwt(trainerAToken);
      const secretKey = new TextEncoder().encode(payload.secret);
      verkeerdeCollectieToken = await new SignJWT({ id: echteClaims.id, collection: "trainer-accounts-nep", sid: echteClaims.sid })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(secretKey);

      // Scenario 5 — precies één training, uitsluitend via trainer B se
      // echte Monday-identiteit (mondayUitvoerderItemId/mondayTrainerboardId)
      // resolveerbaar. De mocks reageren op de daadwerkelijk opgevraagde
      // board-ID, zodat trainer A se eigen (lege) trainerboard nooit per
      // ongeluk B se data ziet — geen call-order-aanname nodig, in
      // tegenstelling tot security.test.ts se mockResolvedValueOnce-ketens
      // (hier onhandig: elke PATCH-aanroep in dit bestand triggert een
      // eigen verzamelTrainerContext-ronde).
      mockScholenPagina.mockImplementation(async (opties: { boardId: string }) => {
        if (opties.boardId === MASTER_DATA_BOARD_ID) {
          return { cursor: null, items: [masterDataItem({ id: SCHOOL_VAN_B_ID, naam: "School van trainer B", trainerLinkedIds: [TRAINER_B_UITVOERDER_ID] })] };
        }
        if (opties.boardId === UITVOERING_BOARD_ID) {
          return { cursor: null, items: [uitvoeringItem({ id: TRAINING_VAN_B_ID, naam: "Training van trainer B", schoolIds: [SCHOOL_VAN_B_ID] })] };
        }
        return { cursor: null, items: [] };
      });
      mockQuery.mockImplementation(async (_query: string, variables?: Record<string, unknown>) => {
        if (variables?.boardId === TRAINER_B_BOARD_ID) {
          return trainerboardBoardsResponse([{ id: TRAINERBOARD_ITEM_VAN_B_ID, name: "Trainerboard-item B", groupTitle: null, masterId: TRAINING_VAN_B_ID }]);
        }
        return trainerboardBoardsResponse([]); // trainer A se eigen (lege) trainerboard, en elk ander onverwacht board
      });
      mockLeesKolomWaarden.mockImplementation(async (_itemId: string, columnIds: string[]) => columnIds.map((id) => ({ id, text: null, value: null })));
    }, 120000);

    afterAll(async () => {
      // Zelfde reden als de migratietest: payload.destroy() sluit de
      // onderliggende pg.Pool nooit, en "WITH (FORCE)" i.p.v. zelf netjes
      // draineren voorkomt een hangende teardown; de no-op 'error'-listener
      // vangt het daardoor verwachte disconnect-event af. Geen apart
      // scratchPool hier (in tegenstelling tot de migratietest) — dit
      // bestand zaait fixtures uitsluitend via Payload's eigen local API
      // (payload.create/payload.login), nooit via losse raw SQL.
      const pool = (payload?.db as unknown as { pool?: { on: (event: string, cb: () => void) => void } })?.pool;
      pool?.on("error", () => {});
      await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM} WITH (FORCE);`);
      await adminPool.end();

      if (oorspronkelijkeDatabaseUri === undefined) delete process.env.DATABASE_URI;
      else process.env.DATABASE_URI = oorspronkelijkeDatabaseUri;
      if (oorspronkelijkePayloadMigrating === undefined) delete process.env.PAYLOAD_MIGRATING;
      else process.env.PAYLOAD_MIGRATING = oorspronkelijkePayloadMigrating;
      if (oorspronkelijkeWriteBackVlag === undefined) delete process.env.TRAINER_MONDAY_WRITEBACK_ENABLED;
      else process.env.TRAINER_MONDAY_WRITEBACK_ENABLED = oorspronkelijkeWriteBackVlag;
    }, 30000);

    function maakRequest(cookieWaarde: string | undefined, id: string, body: unknown): NextRequest {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cookieWaarde !== undefined) headers.Cookie = `payload-token=${cookieWaarde}`;
      return new NextRequest(`http://localhost:3000/api/trainers/trainingen/${id}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    }

    const STANDAARD_VERZOEK = { status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } };

    function roep(cookieWaarde: string | undefined, id: string) {
      return PATCH(maakRequest(cookieWaarde, id, STANDAARD_VERZOEK), { params: Promise.resolve({ id }) });
    }

    it("1. geen cookie -> 401 (dezelfde generieke boodschap)", async () => {
      const response = await roep(undefined, "willekeurig-id");
      expect(response.status).toBe(401);
      expect((await response.json()).error).toBe("Niet ingelogd.");
    });

    it("2. een echte, geldig ingelogde admin/users-sessie wordt nooit als trainersessie geaccepteerd -> 401", async () => {
      const response = await roep(adminToken, "willekeurig-id");
      expect(response.status).toBe(401);
    });

    it("3. een geldig ondertekende JWT met een verkeerde collection-claim -> 401 (bewijst dat de check echt op de claim-waarde zit, niet toevallig alleen 'niet users')", async () => {
      const response = await roep(verkeerdeCollectieToken, "willekeurig-id");
      expect(response.status).toBe(401);
    });

    it("4. een geldige trainer-accounts-sessie wordt geaccepteerd — komt nooit meer bij de 401-tak uit", async () => {
      const response = await roep(trainerAToken, "bestaat-niet-voor-a-of-b");
      expect(response.status).not.toBe(401);
      // haalTrainingVoorMutatie vindt dit ID niet in trainer A se eigen,
      // vers opgehaalde resolutieladder -> 404. Precies dát bewijst dat de
      // 401-tak daadwerkelijk gepasseerd is: de afwijzing komt nu van een
      // heel andere, latere laag (objectresolutie, niet sessieverificatie).
      expect(response.status).toBe(404);
    });

    it("5. trainer A kan de training van trainer B niet bewerken (404) — trainer B zelf komt wél voorbij eigendomscontrole", async () => {
      const responseA = await roep(trainerAToken, TRAINING_VAN_B_ID);
      expect(responseA.status).toBe(404);

      const responseB = await roep(trainerBToken, TRAINING_VAN_B_ID);
      expect(responseB.status).toBe(200);
      const bodyB = await responseB.json();
      // TRAINER_MONDAY_WRITEBACK_ENABLED staat uit -> bewuste, veilige gate
      // treedt pas ná de echte lees-/eigendomscontrole in werking. Geen
      // echte Monday-mutatiepoging, maar wél het bewijs dat trainer B —
      // via exact dezelfde echte auth-/writeback-keten — een heel ander
      // resultaat krijgt dan trainer A voor identiek dezelfde training-ID.
      expect(bodyB.algeheleStatus).toBe("niet_geactiveerd");
    });
  }
);
