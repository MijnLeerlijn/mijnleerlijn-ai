import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { Pool } from "pg";
import { chromium, type Browser, type BrowserContext } from "playwright";
import type { Payload } from "payload";

// Productie-incident 2026-08-19 (live gevonden door Wessel tijdens de
// Traineromgeving-test): een beschermde admin custom view
// (/admin/trainers-diagnose/monday, en identiek voor de andere 12 custom
// views via hetzelfde AdminViewShell.tsx-patroon) rendert de VOLLEDIGE
// admin-shell (sidebar/nav/Sales/Creator/Curriculum Werkplaats) vóórdat er
// enige server-side autorisatiecheck heeft plaatsgevonden — de enige check
// zat in de view zelf, client-side via useAuth(), dus ná hydratie, dus ná
// de shell al zichtbaar was. Zie de uitgebreide toelichting bovenaan
// AdminViewShell.tsx (InAdminShell) voor de volledige root-cause-analyse
// (Payload's eigen RootPage sluit elke admin.components.views-route expliciet
// uit van zijn eigen auth-redirect via isCustomAdminView()).
//
// Dit bestand test de FIX (de nieuwe auth-boundary in InAdminShell) end-to-
// end tegen een ECHTE next dev-server + ECHTE Postgres + ECHTE browser
// (Playwright) — geen mock van redirect()/cookies()/useAuth(), omdat de bug
// zelf precies in de samenwerking tussen die drie zat, niet in één functie
// geïsoleerd te reproduceren was. Zelfde bewuste "echte infra, met
// describe.skipIf-fallback"-patroon als payload/migrations/__tests__/
// 20260819_*_trainer_accounts_*.test.ts. next dev (i.p.v. next start/een
// volledige build:production) is hier voldoende en veel sneller: de bug zit
// in routing/auth-logica die niet verschilt tussen dev en productiebuilds,
// en PAYLOAD_MIGRATING="true" hieronder schakelt dev-mode schema-push sowieso
// uit (zie payload/migrate-preflight.ts se eigen, uitgebreide toelichting)
// — de scratch-database hieronder is bovendien al vóór het opstarten van de
// server volledig gemigreerd.
const TEST_DATABASE_URI =
  process.env.MIGRATION_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_test_admin_auth_boundary";
const PORT = 3177;
const BASE_URL = `http://localhost:${PORT}`;
const TRAINERS_BASE_URL = `http://trainers.localhost:${PORT}`;
const BESCHERMDE_URL = `${BASE_URL}/admin/trainers-diagnose/monday`;
// Zelfde binary als elders in deze sandbox (zie omgevingsnotities) —
// PLAYWRIGHT_BROWSERS_PATH wijst hier al naar, expliciet pad voorkomt een
// eventuele herdownload-poging.
const CHROMIUM_EXECUTABLE = "/opt/pw-browsers/chromium";

const ADMIN_EMAIL = "admin@auth-boundary-test.local";
const ADMIN_WACHTWOORD = "AuthBoundaryAdmin123!";
const TRAINER_EMAIL = "trainer@auth-boundary-test.local";
const TRAINER_WACHTWOORD = "AuthBoundaryTrainer123!";

function vervangDatabasenaam(uri: string, nieuweNaam: string): string {
  const url = new URL(uri);
  url.pathname = `/${nieuweNaam}`;
  return url.toString();
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

async function wachtTotServerKlaar(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // Server nog niet bereikbaar (poort nog niet open) — opnieuw proberen.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server niet klaar binnen ${timeoutMs}ms: ${url}`);
}

const beschikbaar = (await postgresBereikbaar()) && existsSync(CHROMIUM_EXECUTABLE);
const scratchUri = vervangDatabasenaam(TEST_DATABASE_URI, TEST_DB_NAAM);
// Zelfde reden als in payload/migrations/__tests__/20260819_110000_
// trainer_accounts_system_rels_fix.test.ts: DATABASE_URI/PAYLOAD_MIGRATING
// hieronder worden voor de duur van dit bestand overschreven (payload.
// config.ts leest ze op importtijd) — zonder deze op te slaan en in
// afterAll terug te zetten, lekt de tijdelijke scratch-DATABASE_URI naar
// ELK ander testbestand dat in dezelfde vitest-workerpool ná dit bestand
// draait. Die andere bestanden maken dan een NIEUWE Payload-instance tegen
// een DATABASE_URI die naar een inmiddels (in afterAll) alwéér gedropte
// database wijst — precies dít live geraakt tijdens het bouwen van deze
// fix: app/api/curriculum-beheer/[...pad]/route.test.ts faalde pas ná een
// volledige `vitest run`, nooit wanneer dit bestand geïsoleerd draaide.
const oorspronkelijkeDatabaseUri = process.env.DATABASE_URI;
const oorspronkelijkePayloadMigrating = process.env.PAYLOAD_MIGRATING;

describe.skipIf(!beschikbaar)(
  "admin-auth-boundary — echte Postgres + echte next dev-server + echte browser (Playwright)",
  () => {
    let adminPool: Pool;
    let serverProcess: ChildProcessWithoutNullStreams;
    let browser: Browser;
    let seedPayload: Payload;

    beforeAll(async () => {
      adminPool = new Pool({ connectionString: TEST_DATABASE_URI });
      await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM};`);
      await adminPool.query(`CREATE DATABASE ${TEST_DB_NAAM};`);

      execFileSync("npx", ["payload", "migrate"], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URI: scratchUri, PAYLOAD_MIGRATING: "true" },
        stdio: "pipe",
      });

      // payload.config.ts leest DATABASE_URI op importtijd — zie ook de
      // vergelijkbare toelichting in de migratie-regressietests.
      process.env.DATABASE_URI = scratchUri;
      process.env.PAYLOAD_MIGRATING = "true";
      const { getPayload } = await import("payload");
      const config = (await import("@/payload.config")).default;
      seedPayload = await getPayload({ config, key: "seed-admin-auth-boundary" });
      const payload = seedPayload;

      await payload.create({
        collection: "users",
        data: { email: ADMIN_EMAIL, password: ADMIN_WACHTWOORD, name: "Auth Boundary Admin", role: "admin" },
      });
      await payload.create({
        collection: "trainer-accounts",
        data: {
          email: TRAINER_EMAIL,
          password: TRAINER_WACHTWOORD,
          name: "Auth Boundary Trainer",
          mondayTrainerboardId: "0",
          mondayUitvoerderItemId: "0",
          actief: true,
        },
      });

      // NEXT_PUBLIC_SERVER_URL expliciet gezet op de exacte testorigin —
      // zonder dit valt Payload's csrf-allowlist terug op http://localhost:3000
      // (zie lib/auth/verify-session.ts se uitgebreide toelichting), waardoor
      // de ECHTE loginflow hieronder (een fetch()-POST met Origin-header) een
      // overigens geldige sessie stilzwijgend zou kunnen laten weigeren — dat
      // zou dit hele testbestand vals laten falen op iets dat niets met de
      // auth-boundary-fix te maken heeft. NEXT_PUBLIC_ROOT_DOMAIN=localhost
      // laat trainers.localhost:${PORT} correct door proxy.ts se
      // trainersPortalRewrite() herkend worden (zelfde waarde als .env
      // gebruikt voor lokale verificatie elders in dit project).
      // detached: true geeft dit kindproces zijn EIGEN process group (gpid ===
      // eigen pid bij spawnen) — next dev (Turbopack) start zelf weer een
      // onderliggend workerproces dat de poort daadwerkelijk opent; een
      // gewone kill() op alleen het CLI-wrapperproces liet dat kindproces
      // tijdens het bouwen van deze test herhaaldelijk levend achter
      // (poort bleef bezet voor de volgende testrun). afterAll hieronder
      // doodt daarom de HELE group via process.kill(-pid, ...), niet alleen
      // serverProcess.pid zelf.
      serverProcess = spawn("npx", ["next", "dev", "-p", String(PORT)], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URI: scratchUri,
          PAYLOAD_MIGRATING: "true",
          NEXT_PUBLIC_SERVER_URL: BASE_URL,
          NEXT_PUBLIC_ROOT_DOMAIN: "localhost",
        },
        stdio: "pipe",
        detached: true,
      });
      let serverOutput = "";
      serverProcess.stdout.on("data", (chunk) => (serverOutput += String(chunk)));
      serverProcess.stderr.on("data", (chunk) => (serverOutput += String(chunk)));
      serverProcess.on("error", (err) => {
        throw new Error(`next dev kon niet starten: ${err.message}`);
      });

      try {
        await wachtTotServerKlaar(`${BASE_URL}/admin/login`, 120000);
      } catch (fout) {
        throw new Error(`${(fout as Error).message}\n\n--- server-output ---\n${serverOutput.slice(-4000)}`);
      }

      // next dev (Turbopack) compileert elke route pas bij de EERSTE
      // aanvraag — zonder dit "opwarmen" gaf de allereerste echte
      // testnavigatie naar een nog-niet-gecompileerde route onvoorspelbaar
      // gedrag (live geraakt tijdens het bouwen van dit bestand). Voor
      // BESCHERMDE_URL daarom herhaald pollen tot het ECHTE, correcte
      // redirect-naar-login-gedrag zich voordoet — dat bevestigt Turbopack
      // volledig klaar is, niet alleen "heeft een keer geantwoord".
      // BELANGRIJK: dit is NOOIT een echte HTTP 3xx-redirect (zie de
      // toelichting bij InAdminShell) — de statuscode is altijd 200, en
      // redirect() codeert de omleiding als "NEXT_REDIRECT;replace;
      // /admin/login?redirect=...;307;" in de gestreamde React-flightdata
      // van de responsbody zelf. `res.url` verandert daardoor NOOIT, ook
      // niet met `redirect:"follow"` — fetch() heeft simpelweg geen
      // Location-header om te volgen (rechtstreeks bevestigd via een
      // handmatige curl tijdens het diagnosticeren van deze test: 200 OK,
      // geen Location-header, digest wél aanwezig in de body). Een eerdere
      // versie van deze opwarmlus controleerde ten onrechte res.url — die
      // kon dus NOOIT slagen, los van of de fix zelf werkte. De body zelf
      // is hier het enige betrouwbare signaal voor een non-JS client.
      const opwarmDeadline = Date.now() + 60000;
      let beschermdeUrlKlaar = false;
      while (Date.now() < opwarmDeadline && !beschermdeUrlKlaar) {
        try {
          const res = await fetch(BESCHERMDE_URL);
          const body = await res.text();
          if (body.includes("NEXT_REDIRECT") && body.includes("/admin/login")) {
            beschermdeUrlKlaar = true;
          }
        } catch {
          // Server nog niet klaar — opnieuw proberen.
        }
        if (!beschermdeUrlKlaar) await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!beschermdeUrlKlaar) {
        throw new Error(`${BESCHERMDE_URL} gaf ook na opwarmen geen correcte redirect naar /admin/login.`);
      }

      for (const url of [`${TRAINERS_BASE_URL}/login`, `${TRAINERS_BASE_URL}/`]) {
        try {
          await fetch(url, { redirect: "manual" });
        } catch {
          // Genegeerd — de echte tests hieronder controleren het daadwerkelijke gedrag.
        }
      }

      browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
    }, 240000);

    afterAll(async () => {
      await browser?.close();
      if (serverProcess?.pid && !serverProcess.killed) {
        try {
          process.kill(-serverProcess.pid, "SIGKILL");
        } catch {
          // Group al weg (bv. process zelf al gestopt) — geen probleem.
        }
      }

      // Zelfde reden als de migratie-regressietests (zie de uitgebreide
      // toelichting daar): "WITH (FORCE)" forceert Postgres om ELKE
      // resterende verbinding naar deze database te sluiten, inclusief die
      // van seedPayload hierboven — dat vuurt een eigen, ongevangen
      // 'error'-event op diens pg-pool (pg's standaardgedrag bij een
      // backend-gedwongen disconnect), wat vitest anders als "unhandled
      // error" logt (live geraakt tijdens het bouwen van dit bestand, zie
      // ook de curriculum-beheer-testfalen die dit blootlegde).
      const seedPool = (seedPayload?.db as unknown as { pool?: { on: (event: string, cb: () => void) => void } })?.pool;
      seedPool?.on("error", () => {});

      await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM} WITH (FORCE);`);
      await adminPool.end();

      if (oorspronkelijkeDatabaseUri === undefined) delete process.env.DATABASE_URI;
      else process.env.DATABASE_URI = oorspronkelijkeDatabaseUri;
      if (oorspronkelijkePayloadMigrating === undefined) delete process.env.PAYLOAD_MIGRATING;
      else process.env.PAYLOAD_MIGRATING = oorspronkelijkePayloadMigrating;
    }, 60000);

    // "load" i.p.v. "networkidle": next dev houdt een permanente HMR-
    // websocketverbinding open, waardoor "networkidle" in dev-mode nooit
    // bereikt wordt en elke navigatie zou blijven hangen tot de test-
    // timeout — een bekende Playwright/Next-dev-mode-valkuil, live geraakt
    // tijdens het bouwen van dit testbestand (elke it()-navigatie liep
    // hierdoor eerst vast op precies deze regel).
    //
    // page.waitForURL() i.p.v. waitForLoadState() ná het klikken op
    // "Inloggen": Payload's eigen <Form redirect={...}>-component navigeert
    // ná een succesvolle login CLIENT-SIDE (App Router), niet via een volle
    // page-reload — "load" was dus al voorbij (van de eerste page.goto())
    // en wachtte niet daadwerkelijk op de navigatie na login, ook hier live
    // geraakt tijdens het bouwen van dit bestand.
    async function logInViaLoginpagina(context: BrowserContext, email: string, wachtwoord: string) {
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "load" });
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', wachtwoord);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/admin`, { timeout: 15000 });
      return page;
    }

    it("1. anoniem: beschermde admin-URL -> redirect naar admin-login, geen admin-shell zichtbaar", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(BESCHERMDE_URL, { waitUntil: "load" });
      // redirect() in InAdminShell vuurt hier ná het begin van de streaming
      // SSR-respons (de auth-check zelf is async) — Next.js kan de HTTP-
      // statuscode dan niet meer met terugwerkende kracht wijzigen en stuurt
      // de omleiding in plaats daarvan als flight-streamdata mee, die de
      // clientruntime van de browser zelf uitvoert. page.goto()'s eigen
      // "load" ziet daardoor soms nog de aanvankelijke (nog niet omgeleide)
      // staat — expliciet wachten tot de URL daadwerkelijk verandert is
      // hier dus nodig, bevestigd via curl (dat geen JS uitvoert en precies
      // deze tussenstaat liet zien) tijdens het bouwen van dit bestand.
      await page.waitForURL((url) => url.pathname.startsWith("/admin/login"), { timeout: 15000 });

      // Nooit de beschermde URL zelf, altijd de loginpagina.
      expect(page.url().startsWith(`${BASE_URL}/admin/login`)).toBe(true);
      expect(page.url()).toContain("redirect=");
      // Loginformulier zichtbaar (bevestigt: dit is echt de loginpagina).
      expect(await page.locator('input[name="password"]').isVisible()).toBe(true);
      // De diagnoseview se eigen, unieke titel mag nooit even zichtbaar zijn
      // geweest — dit is precies wat vóór de fix wél gebeurde.
      expect(await page.getByText("Traineromgeving — Monday-diagnose").count()).toBe(0);

      await context.close();
    }, 30000);

    it("2. geldige admin: beschermde admin-URL -> directe toegang, geen redirect", async () => {
      const context = await browser.newContext();
      await logInViaLoginpagina(context, ADMIN_EMAIL, ADMIN_WACHTWOORD);

      const page = await context.newPage();
      await page.goto(BESCHERMDE_URL, { waitUntil: "load" });

      expect(page.url()).toBe(BESCHERMDE_URL);
      // TrainersMondayDiagnoseView is een client component: de eigen
      // useAuth()-toegangscheck rendert pas ná hydratie, dus expliciet
      // wachten i.p.v. direct na page.goto() controleren.
      await page.getByText("Traineromgeving — Monday-diagnose").waitFor({ state: "visible", timeout: 10000 });

      await context.close();
    }, 30000);

    it("3. geldige trainer, geen admin: beschermde admin-URL -> admin-login, geen admin-shell", async () => {
      const context = await browser.newContext();
      // Bewust NIET via trainers.localhost inloggen: die host heeft een
      // ANDER cookiescope dan localhost (waar /admin op leeft), dus een
      // sessiecookie gezet op trainers.localhost zou hier sowieso nooit
      // meegestuurd worden — dat zou dit scenario per ongeluk laten
      // "slagen" om de verkeerde reden. /api/trainer-accounts/login is
      // bewust host-onafhankelijk (zie proxy.ts se toelichting) — een POST
      // via de PLAIN localhost-origin zet het sessiecookie exact op de host
      // waar /admin ook op leeft, wat de daadwerkelijk gerapporteerde
      // dreiging is: een geldig trainer-accounts-JWT bereikbaar voor de
      // admin-boundary, via de gedeelde cookienaam "payload-token".
      const loginResponse = await context.request.post(`${BASE_URL}/api/trainer-accounts/login`, {
        data: { email: TRAINER_EMAIL, password: TRAINER_WACHTWOORD },
      });
      expect(loginResponse.ok()).toBe(true);

      const page = await context.newPage();
      await page.goto(BESCHERMDE_URL, { waitUntil: "load" });

      expect(page.url().startsWith(`${BASE_URL}/admin/login`)).toBe(true);
      expect(await page.locator('input[name="password"]').isVisible()).toBe(true);
      expect(await page.getByText("Traineromgeving — Monday-diagnose").count()).toBe(0);

      await context.close();
    }, 30000);

    it("4. na admin-login: terug naar de oorspronkelijk gevraagde beschermde URL", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();

      // Start anoniem, exact zoals scenario 1 — dit test de VOLLEDIGE keten:
      // redirect naar login mét ?redirect=, en na inloggen terug naar
      // precies dezelfde URL (niet slechts /admin). Zelfde waitForURL-reden
      // als scenario 1: page.goto()'s eigen "load" ziet soms nog de
      // aanvankelijke, nog niet omgeleide staat.
      await page.goto(BESCHERMDE_URL, { waitUntil: "load" });
      await page.waitForURL((url) => url.pathname.startsWith("/admin/login"), { timeout: 15000 });
      expect(page.url()).toContain("redirect=");

      await page.fill('input[name="email"]', ADMIN_EMAIL);
      await page.fill('input[name="password"]', ADMIN_WACHTWOORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(BESCHERMDE_URL, { timeout: 15000 });

      expect(page.url()).toBe(BESCHERMDE_URL);
      await page.getByText("Traineromgeving — Monday-diagnose").waitFor({ state: "visible", timeout: 10000 });

      await context.close();
    }, 30000);

    it("5. trainerportal blijft normaal functioneren (regressie op trainers.{ROOT_DOMAIN})", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(`${TRAINERS_BASE_URL}/login`, { waitUntil: "load" });
      await page.fill('input[name="email"]', TRAINER_EMAIL);
      await page.fill('input[name="password"]', TRAINER_WACHTWOORD);
      await page.click('button[type="submit"]');
      // app/(trainers)/trainers/login/page.tsx navigeert ná een succesvolle
      // fetch()-login zelf CLIENT-SIDE (router.push + router.refresh), geen
      // volle page-reload — vandaar waitForURL i.p.v. waitForLoadState.
      await page.waitForURL(`${TRAINERS_BASE_URL}/`, { timeout: 15000 });

      // proxy.ts se trainersPortalRewrite() is een REWRITE, geen redirect —
      // de browser blijft dus op het kale "/" staan (zie de uitgebreide
      // toelichting in app/(trainers)/trainers/(portal)/layout.tsx).
      expect(page.url()).toBe(`${TRAINERS_BASE_URL}/`);
      await page.getByText("Uitloggen").waitFor({ state: "visible", timeout: 10000 });

      await context.close();
    }, 30000);
  }
);
