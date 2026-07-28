import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
import sharp from "sharp";

import { optionalEnv, requireEnv } from "@/config/env";
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
import { AssistantConversations } from "./payload/collections/AssistantConversations";
import { AssistantEvalQuestions } from "./payload/collections/AssistantEvalQuestions";
import { AssistantEvalRuns } from "./payload/collections/AssistantEvalRuns";
import { GmailConnection } from "./payload/globals/GmailConnection";
import { KnowledgeSearch } from "./payload/globals/KnowledgeSearch";
import { AssistantEval } from "./payload/globals/AssistantEval";
import { HelpdeskVoorbeeldvragen } from "./payload/globals/HelpdeskVoorbeeldvragen";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Zie docs/CMS-AND-EDITORIAL-WORKFLOW.md en docs/IMPLEMENTATION-PLAN.md
// Fase 4. Postgres-adapter (dezelfde database die later ook pgvector
// gebruikt, zie docs/ARCHITECTURE.md) — bewust geen SQLite, ook niet lokaal.
//
// Media-opslag: publieke site-afbeeldingen/logo's lopen via de
// vercelBlobStorage-plugin (access: 'public', standaardgedrag). Privé
// contactformulier-bijlagen lopen NIET via deze plugin of via een Payload
// upload-collection — zie payload/collections/ContactSubmissions.ts en
// services/storage.ts voor de motivatie (Vercel Blob private storage +
// signed URL's, rechtstreeks via de @vercel/blob-SDK).
//
// LET OP: @payloadcms/storage-vercel-blob (huidige versie, 3.86.0) bundelt
// intern een oudere @vercel/blob (2.3.1) die uitsluitend een letterlijke
// token accepteert — de nieuwe Vercel OIDC-koppeling (BLOB_STORE_ID +
// automatisch geïnjecteerde VERCEL_OIDC_TOKEN, geen los BLOB_READ_WRITE_TOKEN
// meer nodig) wordt door DEZE plugin nog niet ondersteund. Zonder token
// schakelt de plugin zichzelf uit en valt terug op lokale schijfopslag (niet
// persistent op Vercel) — nooit meer een build-crash, wel bewust zichtbaar
// via de waarschuwing hieronder totdat de plugin OIDC ondersteunt of hier
// alsnog een los token wordt gezet. services/storage.ts (privé bijlagen,
// rechtstreeks @vercel/blob 2.6.1) ondersteunt OIDC wél.
const blobToken = optionalEnv("BLOB_READ_WRITE_TOKEN");

if (!blobToken) {
  console.warn(
    "[payload.config] BLOB_READ_WRITE_TOKEN niet gezet — media-uploads (afbeeldingen/downloads) vallen terug op lokale schijfopslag, niet persistent op Vercel. Zie het commentaar hierboven; dit is geen fatale fout."
  );
}

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
      afterNavLinks: [
        "@/payload/components/DownloadNavLinks#DownloadNavLinks",
        // AI Verbetercentrum (2026-07-27): zelfde patroon als Downloadbeheer
        // hierboven — custom view + eigen nav-linkcomponent, zie
        // payload/components/VerbetercentrumView.tsx/-NavLinks.tsx.
        "@/payload/components/VerbetercentrumNavLinks#VerbetercentrumNavLinks",
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
    AssistantConversations,
    AssistantEvalQuestions,
    AssistantEvalRuns,
  ],
  globals: [GmailConnection, KnowledgeSearch, AssistantEval, HelpdeskVoorbeeldvragen],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: requireEnv("DATABASE_URI") },
    migrationDir: path.resolve(dirname, "payload", "migrations"),
  }),
  typescript: {
    outputFile: path.resolve(dirname, "types", "payload-generated.d.ts"),
  },
  sharp,
  plugins: blobToken
    ? [
        vercelBlobStorage({
          token: blobToken,
          collections: { media: true },
          // Zonder dit botst een tweede upload met dezelfde bestandsnaam
          // (bv. een generieke screenshot-naam als "Schermafbeelding.png",
          // heel gangbaar in de Handleidingbouwer) hard op "blob already
          // exists" — plugin-default is false, ontdekt tijdens live E2E-
          // verificatie van de Handleidingbouwer.
          addRandomSuffix: true,
        }),
      ]
    : [],
});
