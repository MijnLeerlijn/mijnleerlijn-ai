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
import { AssistantConversations } from "./payload/collections/AssistantConversations";
import { GmailConnection } from "./payload/globals/GmailConnection";
import { KnowledgeSearch } from "./payload/globals/KnowledgeSearch";

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
    AssistantConversations,
  ],
  globals: [GmailConnection, KnowledgeSearch],
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
        }),
      ]
    : [],
});
