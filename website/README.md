# MijnLeerlijn AI Kennisplatform

Next.js-app (App Router) + Payload CMS 3 (Postgres-adapter) op één database. Zie de architectuurdocumentatie in [`docs/`](../docs/) voor de volledige context; dit bestand is het praktische opstart- en deployrunboek.

## Lokale ontwikkeling

**Vereist**: Node.js **22 LTS** (niet nieuwer — zie `docs/TODO.md` Fase 4B voor waarom dit ooit ten onrechte aan Node zelf werd toegeschreven; de echte fix zit in `"type": "module"` in `package.json`) en een echte lokale PostgreSQL 16+.

```bash
cp .env.example .env   # vul minstens DATABASE_URI en PAYLOAD_SECRET in
npm install
npm run migrate
npm run seed            # fictieve Fase 3-demo-content, handig voor lokale UI-checks
npm run import:handleidingen   # de 22 echte handleidingen (payload/import-handleidingen/data/)
npm run dev
```

Beheeromgeving: `http://localhost:3000/admin`. Standaard seed-beheerder: `beheerder@mijnleerlijn.nl` — wachtwoord via `SEED_ADMIN_PASSWORD` (env) of de fallback in `payload/seed/index.ts`, **wijzig dit vóór elk gedeeld gebruik**.

## Omgevingsvariabelen

Zie `.env.example` voor de volledige, becommentarieerde lijst. Samengevat:

| Variabele                                                      | Verplicht                                   | Gedrag zonder                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URI`                                                 | Altijd                                      | App start niet                                                                                                                                                                                                                                                                                                                                                   |
| `PAYLOAD_SECRET`                                               | Altijd                                      | App start niet                                                                                                                                                                                                                                                                                                                                                   |
| `NEXT_PUBLIC_SERVER_URL`                                       | Aanbevolen                                  | Valt terug op `http://localhost:3000`                                                                                                                                                                                                                                                                                                                            |
| `BLOB_READ_WRITE_TOKEN`                                        | Aanbevolen                                  | Overbodig voor privé bijlage-opslag als de Blob store via OIDC aan het Vercel-project gekoppeld is (`services/storage.ts`); wél nodig voor de publieke media-plugin totdat `@payloadcms/storage-vercel-blob` OIDC ondersteunt (zie `payload.config.ts`). Zonder token: lokale schijfopslag (niet persistent op Vercel), een duidelijke waarschuwing, geen crash. |
| `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`                         | **Verplicht in productie**                  | Dev: console-e-mailadapter (verstuurt niets echt)                                                                                                                                                                                                                                                                                                                |
| `CONTACT_NOTIFICATION_EMAIL`                                   | Aanbevolen                                  | Geen interne notificatiemail bij een contactinzending                                                                                                                                                                                                                                                                                                            |
| `CRON_SECRET`                                                  | Optioneel                                   | Alleen relevant zodra geplande taken via Vercel Cron draaien                                                                                                                                                                                                                                                                                                     |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` | Nodig voor de Gmail-koppeling               | Zonder deze faalt alleen `/api/gmail/oauth/*` (geen crash elders) — zie hieronder                                                                                                                                                                                                                                                                                |
| `GMAIL_TOKEN_ENCRYPTION_KEY`                                   | Nodig voor de Gmail-koppeling               | Idem — versleutelt de opgeslagen Gmail-tokens (`lib/gmail/encryption.ts`)                                                                                                                                                                                                                                                                                        |
| `OPENAI_API_KEY`                                               | Nodig voor de AI-analyse van supportthreads | Zonder deze faalt alleen `POST /api/support/analyze` (thread krijgt `aiAnalysisStatus: "failed"`, geen crash elders) — zie `services/ai-client.ts` en `lib/support/analyze.ts`                                                                                                                                                                                   |
| `AI_MODEL_ID`                                                  | Optioneel                                   | Overschrijft het standaardmodel (`gpt-4o`) van de centrale AI-client (`services/ai-client.ts`)                                                                                                                                                                                                                                                                   |

`services/ai-client.ts` is de centrale AI-client (Vercel AI SDK, OpenAI-provider — tot 2026-07-23 Anthropic, overgezet vanwege een tijdelijk betaalprobleem met Anthropic-credits, zie het commentaar in dat bestand) — gebruikt door de supportthread-analyse hieronder. `services/ai.ts` (zoekantwoord-synthese) is hier bewust nog niet doorheen omgebouwd en blijft voorlopig extractief (de best gevonden tekst, geen taalmodel-generatie) — zie de motivatie in dat bestand.

## Gmail-helpdeskkoppeling

OAuth 2.0-koppeling met één Gmail-helpdeskaccount, alleen-lezen (`gmail.readonly`) — nog geen e-mailimport, uitsluitend de veilige koppeling zelf. Zie `app/api/gmail/oauth/start`, `.../callback`, `lib/gmail/`, `payload/globals/GmailConnection.ts`.

1. Log in als beheerder op `/admin` (in dezelfde browser/tab).
2. Ga naar `/api/gmail/oauth/start` — dit start het Google-consentscherm. Alleen beheerders komen voorbij deze stap (403 voor iedereen anders).
3. Na toestemming op Google's scherm kom je terug op `/api/gmail/oauth/callback`, die de authorization code server-side inwisselt, de tokens versleuteld opslaat, en uitsluitend een succesmelding + het gekoppelde e-mailadres toont.
4. Status/herkoppelen inzien: `/admin/globals/gmail-connection` (alleen beheerders — de tokens zelf zijn daar nooit meer dan de versleutelde ciphertext).

## AI-analyse van supportthreads (conceptkennisartikelen)

Analyseert geïmporteerde Gmail-threads met AI tot conceptkennisartikelen (`knowledge-drafts`) — nooit automatisch gepubliceerd, altijd handmatig te bekijken/aanpassen/goedkeuren. Zie `lib/support/analyze.ts` voor de volledige privacy-/dedupliceringslogica en `payload/collections/KnowledgeDrafts.ts` voor het datamodel.

- **Eerst maar 5 threads testen**: `/admin/globals/gmail-connection` → knop **"Analyseer nieuwe threads"** kiest zelf tot 5 nog niet (succesvol) geanalyseerde threads.
- **Gerichte selectie**: `/admin/collections/support-threads` → selecteer ten hoogste 5 rijen (checkboxes) → knop **"Analyseer geselecteerde threads"** bovenin de lijst.
- Resultaten (concepten bekijken/goedkeuren/afkeuren): `/admin/collections/knowledge-drafts`.
- Vereist `OPENAI_API_KEY` (zie hierboven); zonder deze variabele faalt de analyse per thread met een technische foutmelding, zonder de thread ten onrechte op "Geanalyseerd" te zetten.

## Productie-/preview-deploy (Vercel)

1. **Accounts/resources vooraf nodig**: Vercel-project, een Postgres-database die ook `pgvector` kan (bv. Neon/Supabase — nog geen pgvector-tabellen in gebruik, maar dezelfde database is de bedoeling, zie `docs/ARCHITECTURE.md`), Vercel Blob store, Resend-account + geverifieerd verzendadres, een domein/subdomein.
2. **Vercel-omgevingsvariabelen instellen** (Project Settings → Environment Variables): alle variabelen uit `.env.example`, met echte waarden. `NEXT_PUBLIC_SERVER_URL` = de echte preview-/productie-URL.
3. **Migraties tegen de productie-/preview-database**:
   ```bash
   DATABASE_URI=<echte-connection-string> PAYLOAD_SECRET=<zelfde-secret-als-productie> npm run migrate
   ```
4. **Productie-seed — GEEN fictieve demo-content**:
   ```bash
   DATABASE_URI=<...> PAYLOAD_SECRET=<...> SEED_INCLUDE_DEMO_ARTICLES=false npm run seed
   DATABASE_URI=<...> PAYLOAD_SECRET=<...> npm run import:handleidingen
   ```
   `SEED_INCLUDE_DEMO_ARTICLES=false` slaat de 75 fictieve Fase 3-artikelen/bronnen/updates over — varianten en categorieën (wél echt, zie code-commentaar in `lib/data/categories.ts`) worden nog steeds gezaaid. Zonder deze vlag staan fictieve demo-artikelen naast de echte handleidingen in productie, wat het "AI verzint niets"-principe van dit project ondermijnt.
5. **Deploy** (`vercel --prod` of via Git-integratie).
6. **Smoke-check na deploy**: `/admin` (inloggen), `/` (zoeken op een bestaande handleiding, bv. "hoofdprofiel aanmaken"), een artikelpagina, `/contact` (test-inzending), Ja/Nee-feedback onder een antwoord.

## Scripts

| Commando                                         | Doel                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `npm run dev` / `build` / `start`                | Next.js                                                      |
| `npm run typecheck` / `lint` / `format` / `test` | Kwaliteitscontrole                                           |
| `npm run generate:types` / `generate:importmap`  | Payload-codegen na collection-wijzigingen                    |
| `npm run migrate` / `migrate:create`             | Payload/Drizzle-migraties                                    |
| `npm run seed`                                   | Fictieve Fase 3-demo-content (lokale ontwikkeling)           |
| `npm run import:handleidingen`                   | Echte handleidingen uit `payload/import-handleidingen/data/` |
