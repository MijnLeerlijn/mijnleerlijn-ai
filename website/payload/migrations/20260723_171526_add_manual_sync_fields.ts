import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Handmatig gehard na `payload migrate:create`, zelfde patroon als de
// eerdere migraties: idempotent met IF NOT EXISTS. Raakt alleen
// knowledge_sources, met twee nieuwe, nullable (dus voor bestaande rijen
// veilige) kolommen.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "source_file_path" varchar;
  ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "source_file_hash" varchar;
  CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_sources_source_file_path_idx" ON "knowledge_sources" USING btree ("source_file_path");
  CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_sources_source_file_hash_idx" ON "knowledge_sources" USING btree ("source_file_hash");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "knowledge_sources_source_file_path_idx";
  DROP INDEX IF EXISTS "knowledge_sources_source_file_hash_idx";
  ALTER TABLE "knowledge_sources" DROP COLUMN IF EXISTS "source_file_path";
  ALTER TABLE "knowledge_sources" DROP COLUMN IF EXISTS "source_file_hash";`)
}
