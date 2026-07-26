import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_assistant_conversations_source" AS ENUM('assistant', 'helpdesk');
  ALTER TABLE "assistant_conversations" ALTER COLUMN "user_id" DROP NOT NULL;
  ALTER TABLE "knowledge_sources" ADD COLUMN "zichtbaar" boolean DEFAULT false;
  ALTER TABLE "knowledge_sources" ADD COLUMN "categorie_id" integer;
  ALTER TABLE "knowledge_sources" ADD COLUMN "volgorde" numeric;
  ALTER TABLE "assistant_conversations" ADD COLUMN "source" "enum_assistant_conversations_source" DEFAULT 'assistant' NOT NULL;
  ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "knowledge_sources_categorie_idx" ON "knowledge_sources" USING btree ("categorie_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "knowledge_sources" DROP CONSTRAINT "knowledge_sources_categorie_id_categories_id_fk";
  
  DROP INDEX "knowledge_sources_categorie_idx";
  ALTER TABLE "assistant_conversations" ALTER COLUMN "user_id" SET NOT NULL;
  ALTER TABLE "knowledge_sources" DROP COLUMN "zichtbaar";
  ALTER TABLE "knowledge_sources" DROP COLUMN "categorie_id";
  ALTER TABLE "knowledge_sources" DROP COLUMN "volgorde";
  ALTER TABLE "assistant_conversations" DROP COLUMN "source";
  DROP TYPE "public"."enum_assistant_conversations_source";`)
}
