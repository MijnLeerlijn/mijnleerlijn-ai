import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_assistant_conversations_intentie_type" AS ENUM('opgelost', 'onduidelijk', 'geen-match');
  CREATE TYPE "public"."enum_assistant_conversations_verbeter_status" AS ENUM('nieuw', 'beoordeeld', 'opgelost', 'genegeerd');
  CREATE TABLE "assistant_conversations_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"kennisbasis_onderwerpen_id" integer
  );
  
  ALTER TABLE "assistant_conversations" ADD COLUMN "previous_question" varchar;
  ALTER TABLE "assistant_conversations" ADD COLUMN "intentie_type" "enum_assistant_conversations_intentie_type";
  ALTER TABLE "assistant_conversations" ADD COLUMN "kennisbasis_onderwerp_id" integer;
  ALTER TABLE "assistant_conversations" ADD COLUMN "gebruikte_officiele_term" varchar;
  ALTER TABLE "assistant_conversations" ADD COLUMN "gebruikte_synoniem" varchar;
  ALTER TABLE "assistant_conversations" ADD COLUMN "contact_form_submitted" boolean DEFAULT false;
  ALTER TABLE "assistant_conversations" ADD COLUMN "geen_handleiding_gevonden" boolean DEFAULT false;
  ALTER TABLE "assistant_conversations" ADD COLUMN "verbeter_status" "enum_assistant_conversations_verbeter_status" DEFAULT 'nieuw' NOT NULL;
  ALTER TABLE "assistant_conversations" ADD COLUMN "prompt_version" varchar;
  ALTER TABLE "assistant_conversations" ADD COLUMN "retrieval_version" varchar;
  ALTER TABLE "assistant_conversations" ADD COLUMN "kennisbasis_version" varchar;
  ALTER TABLE "assistant_conversations_rels" ADD CONSTRAINT "assistant_conversations_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "assistant_conversations_rels" ADD CONSTRAINT "assistant_conversations_rels_kennisbasis_onderwerpen_fk" FOREIGN KEY ("kennisbasis_onderwerpen_id") REFERENCES "public"."kennisbasis_onderwerpen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "assistant_conversations_rels_order_idx" ON "assistant_conversations_rels" USING btree ("order");
  CREATE INDEX "assistant_conversations_rels_parent_idx" ON "assistant_conversations_rels" USING btree ("parent_id");
  CREATE INDEX "assistant_conversations_rels_path_idx" ON "assistant_conversations_rels" USING btree ("path");
  CREATE INDEX "assistant_conversations_rels_kennisbasis_onderwerpen_id_idx" ON "assistant_conversations_rels" USING btree ("kennisbasis_onderwerpen_id");
  ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_kennisbasis_onderwerp_id_kennisbasis_onderwerpen_id_fk" FOREIGN KEY ("kennisbasis_onderwerp_id") REFERENCES "public"."kennisbasis_onderwerpen"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "assistant_conversations_kennisbasis_onderwerp_idx" ON "assistant_conversations" USING btree ("kennisbasis_onderwerp_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "assistant_conversations_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "assistant_conversations_rels" CASCADE;
  ALTER TABLE "assistant_conversations" DROP CONSTRAINT "assistant_conversations_kennisbasis_onderwerp_id_kennisbasis_onderwerpen_id_fk";
  
  DROP INDEX "assistant_conversations_kennisbasis_onderwerp_idx";
  ALTER TABLE "assistant_conversations" DROP COLUMN "previous_question";
  ALTER TABLE "assistant_conversations" DROP COLUMN "intentie_type";
  ALTER TABLE "assistant_conversations" DROP COLUMN "kennisbasis_onderwerp_id";
  ALTER TABLE "assistant_conversations" DROP COLUMN "gebruikte_officiele_term";
  ALTER TABLE "assistant_conversations" DROP COLUMN "gebruikte_synoniem";
  ALTER TABLE "assistant_conversations" DROP COLUMN "contact_form_submitted";
  ALTER TABLE "assistant_conversations" DROP COLUMN "geen_handleiding_gevonden";
  ALTER TABLE "assistant_conversations" DROP COLUMN "verbeter_status";
  ALTER TABLE "assistant_conversations" DROP COLUMN "prompt_version";
  ALTER TABLE "assistant_conversations" DROP COLUMN "retrieval_version";
  ALTER TABLE "assistant_conversations" DROP COLUMN "kennisbasis_version";
  DROP TYPE "public"."enum_assistant_conversations_intentie_type";
  DROP TYPE "public"."enum_assistant_conversations_verbeter_status";`)
}
