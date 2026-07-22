import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
import sharp from "sharp";

import { isProduction, optionalEnv, requireEnv } from "@/config/env";
import { Users } from "./payload/collections/Users";
import { Variants } from "./payload/collections/Variants";
import { Categories } from "./payload/collections/Categories";
import { Articles } from "./payload/collections/Articles";
import { VariantOverrides } from "./payload/collections/VariantOverrides";
import { Sources } from "./payload/collections/Sources";
import { Media } from "./payload/collections/Media";
import { Updates } from "./payload/collections/Updates";
import { ContactSubmissions } from "./payload/collections/ContactSubmissions";

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
const blobToken = optionalEnv("BLOB_READ_WRITE_TOKEN");

if (isProduction() && !blobToken) {
  throw new Error(
    "BLOB_READ_WRITE_TOKEN ontbreekt in productie. Zonder persistente objectopslag kunnen media-uploads niet werken op Vercel (lokale schijfopslag overleeft geen deployment) — zie docs/SECURITY-AND-PRIVACY.md."
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
  ],
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
