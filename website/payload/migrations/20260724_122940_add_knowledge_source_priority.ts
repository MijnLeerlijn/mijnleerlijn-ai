import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Handmatig gehard na `payload migrate:create`, zelfde idempotente patroon
// als de eerdere migraties: DO-block met een existence-check voor het enum-
// type (CREATE TYPE ondersteunt geen IF NOT EXISTS), en IF NOT EXISTS voor
// de kolom zelf. DEFAULT 'core' NOT NULL vult bestaande rijen automatisch —
// geen losse backfill-stap nodig, zie het commentaar bij het veld in
// payload/collections/KnowledgeSources.ts.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_knowledge_sources_priority" AS ENUM('core', 'secondary', 'reference');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "priority" "enum_knowledge_sources_priority" DEFAULT 'core' NOT NULL;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "knowledge_sources" DROP COLUMN IF EXISTS "priority";
  DROP TYPE IF EXISTS "public"."enum_knowledge_sources_priority";`);
}
