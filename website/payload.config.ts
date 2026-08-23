import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { cloudStoragePlugin } from "@payloadcms/plugin-cloud-storage";
import sharp from "sharp";

import { isProduction, optionalEnv, requireEnv, getTrainersOrigin } from "@/config/env";
import { privateBlobAdapter } from "@/lib/media/private-blob-adapter";
import { Users } from "./payload/collections/Users";
import { TrainerAccounts } from "./payload/collections/TrainerAccounts";
import { TrainerLogEvents } from "./payload/collections/TrainerLogEvents";
import { TrainerAiLogEvents } from "./payload/collections/TrainerAiLogEvents";
import { TrainingVerslagen } from "./payload/collections/TrainingVerslagen";
import { TrainerTelefonieOproepen } from "./payload/collections/TrainerTelefonieOproepen";
import { TrainerLogboekItems } from "./payload/collections/TrainerLogboekItems";
import { TrainerKennisversies } from "./payload/collections/TrainerKennisversies";
import { TrainerDeelgroepen } from "./payload/collections/TrainerDeelgroepen";
import { TrainerBestanden } from "./payload/collections/TrainerBestanden";
import { Variants } from "./payload/collections/Variants";
import { Categories } from "./payload/collections/Categories";
import { Articles } from "./payload/collections/Articles";
import { VariantOverrides } from "./payload/collections/VariantOverrides";
import { Sources } from "./payload/collections/Sources";
import { Media } from "./payload/collections/Media";
import { Updates } from "./payload/collections/Updates";
import { ContactSubmissions } from "./payload/collections/ContactSubmissions";
import { AnswerFeedback } from "./payload/collections/AnswerFeedback";
import { SupportThreads } from "./payload/collections/SupportThreads";
import { KnowledgeDrafts } from "./payload/collections/KnowledgeDrafts";
import { KnowledgeSources } from "./payload/collections/KnowledgeSources";
import { Handleidingen } from "./payload/collections/Handleidingen";
import { KennisbasisOnderwerpen } from "./payload/collections/KennisbasisOnderwerpen";
import { HelpdeskVragen } from "./payload/collections/HelpdeskVragen";
import { AssistantConversations } from "./payload/collections/AssistantConversations";
import { AssistantEvalQuestions } from "./payload/collections/AssistantEvalQuestions";
import { AssistantEvalRuns } from "./payload/collections/AssistantEvalRuns";
import { MailDrafts } from "./payload/collections/MailDrafts";
import { MailTemplates } from "./payload/collections/MailTemplates";
import { DerivedContent } from "./payload/collections/DerivedContent";
import { SalesSchools } from "./payload/collections/SalesSchools";
import { SalesLogEvents } from "./payload/collections/SalesLogEvents";
import { SalesActions } from "./payload/collections/SalesActions";
import { SalesProposals } from "./payload/collections/SalesProposals";
import { PersonalTasks } from "./payload/collections/PersonalTasks";
import { GoogleConnections } from "./payload/collections/GoogleConnections";
import { VoorbereidingSignalen } from "./payload/collections/VoorbereidingSignalen";
import { MailSignalen } from "./payload/collections/MailSignalen";
import { GmailConnection } from "./payload/globals/GmailConnection";
import { KnowledgeSearch } from "./payload/globals/KnowledgeSearch";
import { AssistantEval } from "./payload/globals/AssistantEval";
import { KennisbasisMijnleerlijn } from "./payload/globals/KennisbasisMijnleerlijn";
import { HelpdeskInstellingen } from "./payload/globals/HelpdeskInstellingen";
import { SalesInstellingen } from "./payload/globals/SalesInstellingen";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Zie docs/CMS-AND-EDITORIAL-WORKFLOW.md en docs/IMPLEMENTATION-PLAN.md
// Fase 4. Postgres-adapter (dezelfde database die later ook pgvector
// gebruikt, zie docs/ARCHITECTURE.md) — bewust geen SQLite, ook niet lokaal.
//
// Media-opslag (2026-07-31, uniforme private-uploadarchitectuur): elke
// upload naar de "media"-collectie (variantlogo's, Handleidingbouwer-
// screenshots, losse media) loopt via lib/media/private-blob-adapter.ts,
// dat dezelfde private Vercel Blob-store gebruikt als Downloadbeheer's
// PDF-upload en de contactformulier-bijlagen (services/storage.ts) — zie
// dat bestand voor de volledige motivatie. Vervangt de eerdere
// vercelBlobStorage-plugin (@payloadcms/storage-vercel-blob), die
// uitsluitend 'public'-toegang ondersteunde en daardoor structureel botste
// met de bewust private mijnleerlijn-media-store (opdracht: "maak
// mijnleerlijn-media niet publiek").

// serverURL bepaalt (via Payload's config-sanitize.js) ALTIJD en uitsluitend
// payload.config.csrf — de allowlist die Payload's eigen cookie-gebaseerde
// sessieherkenning gebruikt zodra een aanvraag een Origin-header meestuurt
// (elke fetch()-POST doet dat altijd, een gewone paginanavigatie vaak niet).
// Staat NEXT_PUBLIC_SERVER_URL niet (of onjuist) in de omgeving, dan valt
// serverURL terug op localhost:3000 — en verwerpt Payload in productie
// stilzwijgend een verder volkomen geldige sessiecookie op elke eigen
// fetch()-POST-route (ontdekt via app/api/gmail/sync, zie lib/auth/
// verify-session.ts voor de volledige analyse en de work-around daar).
if (!optionalEnv("NEXT_PUBLIC_SERVER_URL")) {
  console.warn(
    "[payload.config] NEXT_PUBLIC_SERVER_URL niet gezet — serverURL valt terug op http://localhost:3000, wat Payload's csrf-allowlist verkeerd vult. Eigen POST-routes die payload.auth() gebruiken (bv. app/api/gmail/sync) kunnen dan een echt ingelogde beheerder ten onrechte afwijzen. Zet deze variabele in productie op de exacte, echte URL (protocol + host, geen trailing slash)."
  );
}

export default buildConfig({
  serverURL: optionalEnv("NEXT_PUBLIC_SERVER_URL") ?? "http://localhost:3000",
  // Traineromgeving V1, Ronde 1 (2026-08-19) — zonder deze expliciete
  // toevoeging bestaat de csrf-allowlist na sanitize.js (config/sanitize.js:
  // `config.csrf.push(config.serverURL)`) ALLEEN uit serverURL zelf — nooit
  // uit trainers.{ROOT_DOMAIN}, een ander subdomein. Payload's eigen
  // extractJWT() (node_modules/payload/dist/auth/extractJWT.js) zou dan élke
  // fetch()-POST vanaf de Traineromgeving die op Payload's eigen req.user
  // leunt (bv. /api/trainer-accounts/logout) afwijzen — zie getTrainersOrigin() in
  // config/env.ts voor de volledige analyse. `csrf` is puur additief (zie
  // types.d.ts: `csrf?: string[]`) — dit verzwakt de bestaande allowlist
  // voor "users" niet, het voegt uitsluitend één extra, expliciet
  // toegestane origin toe.
  csrf: [getTrainersOrigin()],
  secret: requireEnv("PAYLOAD_SECRET"),
  // Foutafhandeling logo-upload (2026-07-31): Payload vervangt STANDAARD elke
  // niet-publieke serverfout door de generieke "Something went wrong." (zie
  // node_modules/payload/dist/utilities/routeError.js — `isErrorPublic()` +
  // `if (!isErrorPublic) response = formatErrors(new APIError('Something
  // went wrong.'))`), tenzij `config.debug === true`. Dit was de reden dat de
  // echte Vercel Blob-fout ("Cannot use public access on a private store")
  // nergens in de UI zichtbaar was — wél al die hele tijd correct gelogd via
  // payload.logger.error (dus zichtbaar in Vercel Runtime Logs), maar nooit
  // doorgestuurd naar de browser. `debug: true` GEEFT foutdetails (incl.
  // stack) door in de API-response — expliciet uitsluitend buiten productie,
  // nooit potentieel gevoelige interne foutdetails aan productiegebruikers
  // tonen.
  debug: !isProduction(),
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname, "app", "(payload)", "admin") },
    meta: { titleSuffix: " — MijnLeerlijn Beheer" },
    // Downloadbeheer (2026-07-27): eerste volledige custom admin-views in
    // dit project (zie payload/components/DownloadbeheerView.tsx en
    // -DownloadcategorieenView.tsx) — vervangt het per-document zetten van
    // zichtbaar/categorie/volgorde op Handleidingen/KnowledgeSources door
    // twee centrale beheerpagina's. `views` registreert de pagina's zelf;
    // `afterNavLinks` voegt de menu-links toe (custom views krijgen die
    // niet automatisch).
    components: {
      // Admin-rebrand Fase 1 (2026-08-12): BeheerNavLinks.tsx vervangt
      // BasisNavLinks.tsx + VariantenNavLinks.tsx (verwijderd) — één
      // permissiebewuste component met alle 24 collecties/globals + 8
      // custom views in 4 taakgerichte hoofdgroepen (Algemeen, Helpdesk AI,
      // Creator, Curriculum Werkplaats — zie lib/admin-nav/nav-groups.ts),
      // i.p.v. Payload's kale, technische standaardnav. Die standaardnav
      // wordt via CSS verborgen (payload/components/admin-shell.css) —
      // GEEN enkele collectie/global-config verandert hierdoor (dus geen
      // admin.hidden, zie de toelichting in Variants.ts over waarom niet).
      afterNavLinks: ["@/payload/components/BeheerNavLinks#BeheerNavLinks"],
      // Fase 1B (2026-08-13): DefaultTemplate (node_modules/@payloadcms/next/
      // dist/templates/Default/index.js) rendert admin.components.header als
      // eerste element, boven nav én content — verschijnt daardoor automatisch
      // op elke pagina die DefaultTemplate gebruikt (dashboard, alle native
      // collectie-/global-views, en via AdminViewShell.tsx alle 7 custom
      // views hieronder), zonder één van die pagina's zelf aan te passen.
      // MinimalTemplate (login) leest deze sleutel niet — verschijnt daar dus
      // terecht niet. Combineert de "Dashboard"-breadcrumb met de
      // toevoegen/verwijderen-van-dashboard-schakelaar (zie BeheerTopBar.tsx).
      header: ["@/payload/components/BeheerTopBar#BeheerTopBar"],
      // Admin-rebrand Fase 1: eigen dashboard + loginpagina. Beide
      // viewKeys vallen samen met een ingebouwde Payload-route
      // (dashboard/login), dus krijgen ze — anders dan de custom views
      // hieronder — altijd al automatisch de juiste chrome (resp.
      // <DefaultTemplate>, <MinimalTemplate>) zonder AdminViewShell.tsx.
      // BeheerLoginView.tsx bouwt zelf een volledig eigen vormgeving maar
      // hergebruikt Payload's eigen Form/useAuth/EmailField/PasswordField/
      // getSafeRedirect-bouwstenen — geen nieuw authenticatiemechanisme.
      views: {
        dashboard: { Component: "@/payload/components/BeheerDashboard#BeheerDashboard" },
        login: { Component: "@/payload/components/BeheerLoginView#BeheerLoginView" },
        // Admin-shell-fix (2026-07-28): Component wijst naar de nieuwe
        // server-wrappers in AdminViewShell.tsx (renderen de standaard
        // Payload-adminshell via <DefaultTemplate> om de ongewijzigde
        // content-componenten heen), niet meer rechtstreeks naar de
        // "use client"-viewcomponenten — zie AdminViewShell.tsx voor de reden.
        downloadbeheer: {
          Component: "@/payload/components/AdminViewShell#DownloadbeheerViewShell",
          path: "/download-beheer",
        },
        downloadcategorieen: {
          Component: "@/payload/components/AdminViewShell#DownloadcategorieenViewShell",
          path: "/download-categorieen",
        },
        verbetercentrum: {
          Component: "@/payload/components/AdminViewShell#VerbetercentrumViewShell",
          path: "/verbetercentrum",
        },
        helpdeskVragen: {
          Component: "@/payload/components/AdminViewShell#HelpdeskVragenViewShell",
          path: "/helpdesk-vragen",
        },
        varianten: {
          Component: "@/payload/components/AdminViewShell#VariantenViewShell",
          path: "/varianten",
        },
        kennisbasis: {
          Component: "@/payload/components/AdminViewShell#KennisbasisViewShell",
          path: "/kennisbasis",
        },
        // Helpdesk-beheerkoppeling (2026), punt 5-6: beheeroverzicht +
        // detailpagina voor Curriculum Werkplaats-omgevingen. Eén statisch
        // pad (geen dynamisch routesegment, zie CurriculumWerkplaatsView.tsx
        // voor waarom) — de detailweergave wisselt client-side via
        // ?project=<id>.
        curriculumWerkplaats: {
          Component: "@/payload/components/AdminViewShell#CurriculumWerkplaatsViewShell",
          path: "/curriculum-werkplaats",
        },
        // Creator V1 (2026-08-13): startscherm/werkruimte/mailflow op één
        // statisch pad, zelfde aanpak als curriculumWerkplaats hierboven
        // (client-side wisselen via ?artikel=<id> / ?mail=<id>, zie
        // CreatorView.tsx).
        creator: {
          Component: "@/payload/components/AdminViewShell#CreatorViewShell",
          path: "/creator",
        },
        // Sales-assistent V1 (2026-08-14): dezelfde aanpak als creator/
        // curriculumWerkplaats hierboven — statische paden, client-side
        // wisselen via query-params waar nodig (bv. schooldetail via
        // ?id=<id>), geen dynamische routesegmenten.
        //
        // `exact: true` is HIER, anders dan bij elke andere custom view in
        // dit bestand, wél verplicht: Payload's eigen route-matching
        // (getCustomViewByRoute.js/isPathMatchingRoute.js) doet zonder
        // `exact` een PREFIX-match (`currentRoute.startsWith(viewPath)`) en
        // pakt de EERSTE match in registratievolgorde — "/sales" (Vandaag)
        // is een prefix van "/sales/scholen"/"/sales/school"/"/sales/acties",
        // dus zonder `exact: true` rendert elke sub-pagina stilzwijgend de
        // Vandaag-view. Ontdekt tijdens browserverificatie (breadcrumb bleef
        // "Sales / Vandaag" tonen op /admin/sales/scholen). Geen van de
        // bestaande custom views hierboven had ooit deze prefix-relatie
        // tussen paden, vandaar dat dit daar nooit nodig was.
        salesVandaag: {
          Component: "@/payload/components/AdminViewShell#SalesVandaagViewShell",
          path: "/sales",
          exact: true,
        },
        salesScholen: {
          Component: "@/payload/components/AdminViewShell#SalesScholenViewShell",
          path: "/sales/scholen",
          exact: true,
        },
        salesSchooldetail: {
          Component: "@/payload/components/AdminViewShell#SalesSchooldetailViewShell",
          path: "/sales/school",
          exact: true,
        },
        salesActies: {
          Component: "@/payload/components/AdminViewShell#SalesActiesViewShell",
          path: "/sales/acties",
          exact: true,
        },
        // Write-back-diagnose (2026-08-15) — TIJDELIJK, geen nav-groups.ts-item
        // (dat is de permanente IA; dit scherm hoort daar expliciet niet in
        // thuis, zie de opdracht: verwijderen/verbergen na succesvolle
        // verificatie). Alleen bereikbaar via directe URL. `exact: true` om
        // dezelfde reden als de andere /sales/*-paden hierboven.
        salesMondayDiagnose: {
          Component: "@/payload/components/AdminViewShell#SalesMondayDiagnoseViewShell",
          path: "/sales/monday-diagnose",
          exact: true,
        },
        // Traineromgeving-onderzoek (2026-08-19) — TIJDELIJK, read-only,
        // geen nav-groups.ts-item (zelfde reden als salesMondayDiagnose
        // hierboven: alleen bereikbaar via directe URL, verwijderen zodra
        // A–D van het architectuuronderzoek zijn afgerond).
        trainersMondayDiagnose: {
          Component: "@/payload/components/AdminViewShell#TrainersMondayDiagnoseViewShell",
          path: "/trainers-diagnose/monday",
          exact: true,
        },
      },
    },
  },
  collections: [
    Users,
    TrainerAccounts,
    TrainerLogEvents,
    TrainerAiLogEvents,
    TrainingVerslagen,
    TrainerTelefonieOproepen,
    TrainerLogboekItems,
    TrainerKennisversies,
    TrainerDeelgroepen,
    TrainerBestanden,
    Variants,
    Categories,
    Articles,
    VariantOverrides,
    Sources,
    Media,
    Updates,
    ContactSubmissions,
    AnswerFeedback,
    SupportThreads,
    KnowledgeDrafts,
    KnowledgeSources,
    Handleidingen,
    MailDrafts,
    MailTemplates,
    DerivedContent,
    KennisbasisOnderwerpen,
    HelpdeskVragen,
    AssistantConversations,
    AssistantEvalQuestions,
    AssistantEvalRuns,
    SalesSchools,
    SalesLogEvents,
    SalesActions,
    SalesProposals,
    PersonalTasks,
    GoogleConnections,
    VoorbereidingSignalen,
    MailSignalen,
  ],
  globals: [GmailConnection, KnowledgeSearch, AssistantEval, KennisbasisMijnleerlijn, HelpdeskInstellingen, SalesInstellingen],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: requireEnv("DATABASE_URI") },
    migrationDir: path.resolve(dirname, "payload", "migrations"),
    // Homepage-herontwerp (2026-07-29): `push` (Payload's dev-mode live
    // schema-sync, vergelijkbaar met `prisma db push`) staat hier uit.
    // Ontdekt tijdens lokaal testen: na het verwijderen van de oude Global
    // HelpdeskVoorbeeldvragen uit deze config (de onderliggende tabellen
    // blijven bewust bestaan, zie payload/globals/HelpdeskVoorbeeldvragen.ts)
    // bood push bij ELKE aanvraag opnieuw aan om die tabellen te
    // verwijderen ("DATA LOSS WARNING"), en liet — zonder interactieve
    // terminal om te bevestigen/weigeren — elke pagina daardoor 15-60+
    // seconden hangen. `payload migrate` (dit project se eigen, al
    // gevestigde workflow — zie payload/migrations/) blijft de enige manier
    // om het lokale schema bij te werken; production (build:production)
    // gebruikte push toch al nooit.
    push: false,
  }),
  typescript: {
    outputFile: path.resolve(dirname, "types", "payload-generated.d.ts"),
  },
  sharp,
  plugins: [
    cloudStoragePlugin({
      collections: {
        media: {
          adapter: privateBlobAdapter,
          // De adapter zelf zorgt al voor unieke bestandsnamen (crypto.
          // randomUUID() in de storage-sleutel, zie services/storage.ts) —
          // "blob already exists"-botsingen op een generieke bestandsnaam
          // (bv. "Schermafbeelding.png", gangbaar in de Handleidingbouwer)
          // zijn hierdoor structureel uitgesloten, dezelfde bescherming die
          // de oude plugin se addRandomSuffix: true bood.
        },
      },
    }),
  ],
});
