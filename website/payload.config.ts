import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { cloudStoragePlugin } from "@payloadcms/plugin-cloud-storage";
import sharp from "sharp";

import { isProduction, optionalEnv, requireEnv } from "@/config/env";
import { privateBlobAdapter } from "@/lib/media/private-blob-adapter";
import { Users } from "./payload/collections/Users";
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
import { GmailConnection } from "./payload/globals/GmailConnection";
import { KnowledgeSearch } from "./payload/globals/KnowledgeSearch";
import { AssistantEval } from "./payload/globals/AssistantEval";
import { KennisbasisMijnleerlijn } from "./payload/globals/KennisbasisMijnleerlijn";
import { HelpdeskInstellingen } from "./payload/globals/HelpdeskInstellingen";

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
      // Menu-herindeling (2026-07-31): nog maar twee navigatiegroepen via
      // afterNavLinks — "Basis" (BasisNavLinks.tsx, momenteel alleen AI
      // Verbetercentrum) en "Varianten" (VariantenNavLinks.tsx, alle vijf
      // Varianten-beheerschermen in één groep — vervangt de eerder losse
      // DownloadNavLinks/HelpdeskVragenNavLinks/VerbetercentrumNavLinks).
      // HelpdeskVragen is `admin.hidden` (volledig vervangen door zijn
      // custom scherm), dus deze link is de enige toegang daartoe. Variants
      // en VariantOverrides zijn bewust NIET hidden (zie het commentaar in
      // Variants.ts: `hidden` bleek ook de client-side formulierrendering
      // te blokkeren, niet alleen de nav) — ze staan daarom ook nog in de
      // "Basis — Technisch beheer"-groep, voor wie het volledige Payload-
      // editscherm nodig heeft (logo/terminologie/website-teksten/domein).
      afterNavLinks: [
        "@/payload/components/BasisNavLinks#BasisNavLinks",
        "@/payload/components/VariantenNavLinks#VariantenNavLinks",
      ],
      // Admin-shell-fix (2026-07-28): Component wijst naar de nieuwe
      // server-wrappers in AdminViewShell.tsx (renderen de standaard
      // Payload-adminshell via <DefaultTemplate> om de ongewijzigde
      // content-componenten heen), niet meer rechtstreeks naar de
      // "use client"-viewcomponenten — zie AdminViewShell.tsx voor de reden.
      views: {
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
      },
    },
  },
  collections: [
    Users,
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
    KennisbasisOnderwerpen,
    HelpdeskVragen,
    AssistantConversations,
    AssistantEvalQuestions,
    AssistantEvalRuns,
  ],
  globals: [GmailConnection, KnowledgeSearch, AssistantEval, KennisbasisMijnleerlijn, HelpdeskInstellingen],
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
