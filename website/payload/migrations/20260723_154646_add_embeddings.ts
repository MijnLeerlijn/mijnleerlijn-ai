import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Handmatig gehard na `payload migrate:create`, zelfde patroon als de
// eerdere migraties: idempotent met IF NOT EXISTS / DO-blokken. De
// rename van knowledge_sources.embedding_updated_at (Sprint 3, nooit
// daadwerkelijk beschreven) naar embedded_at is met opzet HANDMATIG
// toegevoegd als een echte RENAME COLUMN, niet als drop+add — de
// interactieve rename-detectie van drizzle-kit (`payload migrate:create`)
// bleek niet non-interactief aan te sturen; de migratie is daarom
// gegenereerd met de oude naam nog in de collectie, en pas hierna
// omgezet naar de echte gewenste eindtoestand.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
   CREATE TYPE "public"."enum_knowledge_drafts_embedding_status" AS ENUM('pending', 'indexed', 'stale');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  CREATE TABLE IF NOT EXISTS "knowledge_search" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "embedded_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "embedding_model" varchar;
  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "embedding_text_hash" varchar;
  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "embedding" jsonb;
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_embedded_at" timestamp(3) with time zone;
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_embedding_model" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_embedding_text_hash" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_embedding" jsonb;
  ALTER TABLE "knowledge_drafts" ADD COLUMN IF NOT EXISTS "embedding_status" "enum_knowledge_drafts_embedding_status" DEFAULT 'pending' NOT NULL;
  ALTER TABLE "knowledge_drafts" ADD COLUMN IF NOT EXISTS "embedded_at" timestamp(3) with time zone;
  ALTER TABLE "knowledge_drafts" ADD COLUMN IF NOT EXISTS "embedding_model" varchar;
  ALTER TABLE "knowledge_drafts" ADD COLUMN IF NOT EXISTS "embedding_text_hash" varchar;
  ALTER TABLE "knowledge_drafts" ADD COLUMN IF NOT EXISTS "embedding" jsonb;
  ALTER TABLE "knowledge_sources_chapters" ADD COLUMN IF NOT EXISTS "embedding" jsonb;
  ALTER TABLE "knowledge_sources_chapters" ADD COLUMN IF NOT EXISTS "embedding_text_hash" varchar;
  ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "embedding_model" varchar;
  ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "embedding_text_hash" varchar;
  ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "embedding" jsonb;

  DO $$ BEGIN
   IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_sources' AND column_name = 'embedding_updated_at')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_sources' AND column_name = 'embedded_at') THEN
     ALTER TABLE "knowledge_sources" RENAME COLUMN "embedding_updated_at" TO "embedded_at";
   ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_sources' AND column_name = 'embedded_at') THEN
     ALTER TABLE "knowledge_sources" ADD COLUMN "embedded_at" timestamp(3) with time zone;
   END IF;
  END $$;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "knowledge_search" CASCADE;
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "embedded_at";
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "embedding_model";
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "embedding_text_hash";
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "embedding";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_embedded_at";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_embedding_model";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_embedding_text_hash";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_embedding";
  ALTER TABLE "knowledge_drafts" DROP COLUMN IF EXISTS "embedding_status";
  ALTER TABLE "knowledge_drafts" DROP COLUMN IF EXISTS "embedded_at";
  ALTER TABLE "knowledge_drafts" DROP COLUMN IF EXISTS "embedding_model";
  ALTER TABLE "knowledge_drafts" DROP COLUMN IF EXISTS "embedding_text_hash";
  ALTER TABLE "knowledge_drafts" DROP COLUMN IF EXISTS "embedding";
  ALTER TABLE "knowledge_sources_chapters" DROP COLUMN IF EXISTS "embedding";
  ALTER TABLE "knowledge_sources_chapters" DROP COLUMN IF EXISTS "embedding_text_hash";
  ALTER TABLE "knowledge_sources" DROP COLUMN IF EXISTS "embedding_model";
  ALTER TABLE "knowledge_sources" DROP COLUMN IF EXISTS "embedding_text_hash";
  ALTER TABLE "knowledge_sources" DROP COLUMN IF EXISTS "embedding";
  ALTER TABLE "knowledge_sources" RENAME COLUMN "embedded_at" TO "embedding_updated_at";
  DROP TYPE IF EXISTS "public"."enum_knowledge_drafts_embedding_status";`);
}
