import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_knowledge_sources_purpose" AS ENUM('background-model', 'manual', 'release-note', 'faq', 'support');
  CREATE TYPE "public"."enum_assistant_eval_questions_category" AS ENUM('feitelijk', 'stap_voor_stap', 'meerdere_routes', 'onduidelijk', 'onvoldoende_bron');
  CREATE TYPE "public"."enum_assistant_eval_runs_verdict" AS ENUM('nog_niet_beoordeeld', 'correct', 'gedeeltelijk_correct', 'incorrect');
  CREATE TABLE "assistant_eval_questions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"category" "enum_assistant_eval_questions_category" NOT NULL,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "assistant_eval_runs_hits" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" varchar NOT NULL,
  	"ref_id" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"chapter_title" varchar,
  	"similarity" numeric NOT NULL,
  	"priority" varchar,
  	"bronrol" varchar
  );
  
  CREATE TABLE "assistant_eval_runs_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"ref_collection" varchar NOT NULL,
  	"ref_id" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"chapter_title" varchar,
  	"similarity" numeric NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "assistant_eval_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"eval_question_id" integer,
  	"question" varchar NOT NULL,
  	"rewritten_query" varchar NOT NULL,
  	"retrieval_fase" varchar NOT NULL,
  	"context_text" varchar NOT NULL,
  	"has_answer" boolean DEFAULT false NOT NULL,
  	"answer" varchar NOT NULL,
  	"reasoning" varchar,
  	"confidence" numeric NOT NULL,
  	"model" varchar,
  	"verdict" "enum_assistant_eval_runs_verdict" DEFAULT 'nog_niet_beoordeeld',
  	"opmerkingen" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "assistant_eval" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "knowledge_sources" ADD COLUMN "content" varchar;
  ALTER TABLE "knowledge_sources" ADD COLUMN "purpose" "enum_knowledge_sources_purpose";
  ALTER TABLE "knowledge_sources_rels" ADD COLUMN "variants_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "assistant_eval_questions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "assistant_eval_runs_id" integer;
  ALTER TABLE "assistant_eval_runs_hits" ADD CONSTRAINT "assistant_eval_runs_hits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."assistant_eval_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "assistant_eval_runs_sources" ADD CONSTRAINT "assistant_eval_runs_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."assistant_eval_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "assistant_eval_runs" ADD CONSTRAINT "assistant_eval_runs_eval_question_id_assistant_eval_questions_id_fk" FOREIGN KEY ("eval_question_id") REFERENCES "public"."assistant_eval_questions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "assistant_eval_questions_updated_at_idx" ON "assistant_eval_questions" USING btree ("updated_at");
  CREATE INDEX "assistant_eval_questions_created_at_idx" ON "assistant_eval_questions" USING btree ("created_at");
  CREATE INDEX "assistant_eval_runs_hits_order_idx" ON "assistant_eval_runs_hits" USING btree ("_order");
  CREATE INDEX "assistant_eval_runs_hits_parent_id_idx" ON "assistant_eval_runs_hits" USING btree ("_parent_id");
  CREATE INDEX "assistant_eval_runs_sources_order_idx" ON "assistant_eval_runs_sources" USING btree ("_order");
  CREATE INDEX "assistant_eval_runs_sources_parent_id_idx" ON "assistant_eval_runs_sources" USING btree ("_parent_id");
  CREATE INDEX "assistant_eval_runs_eval_question_idx" ON "assistant_eval_runs" USING btree ("eval_question_id");
  CREATE INDEX "assistant_eval_runs_updated_at_idx" ON "assistant_eval_runs" USING btree ("updated_at");
  CREATE INDEX "assistant_eval_runs_created_at_idx" ON "assistant_eval_runs" USING btree ("created_at");
  ALTER TABLE "knowledge_sources_rels" ADD CONSTRAINT "knowledge_sources_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_assistant_eval_questions_fk" FOREIGN KEY ("assistant_eval_questions_id") REFERENCES "public"."assistant_eval_questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_assistant_eval_runs_fk" FOREIGN KEY ("assistant_eval_runs_id") REFERENCES "public"."assistant_eval_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "knowledge_sources_rels_variants_id_idx" ON "knowledge_sources_rels" USING btree ("variants_id");
  CREATE INDEX "payload_locked_documents_rels_assistant_eval_questions_i_idx" ON "payload_locked_documents_rels" USING btree ("assistant_eval_questions_id");
  CREATE INDEX "payload_locked_documents_rels_assistant_eval_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("assistant_eval_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "assistant_eval_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "assistant_eval_runs_hits" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "assistant_eval_runs_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "assistant_eval_runs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "assistant_eval" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "assistant_eval_questions" CASCADE;
  DROP TABLE "assistant_eval_runs_hits" CASCADE;
  DROP TABLE "assistant_eval_runs_sources" CASCADE;
  DROP TABLE "assistant_eval_runs" CASCADE;
  DROP TABLE "assistant_eval" CASCADE;
  ALTER TABLE "knowledge_sources_rels" DROP CONSTRAINT "knowledge_sources_rels_variants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_assistant_eval_questions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_assistant_eval_runs_fk";
  
  DROP INDEX "knowledge_sources_rels_variants_id_idx";
  DROP INDEX "payload_locked_documents_rels_assistant_eval_questions_i_idx";
  DROP INDEX "payload_locked_documents_rels_assistant_eval_runs_id_idx";
  ALTER TABLE "knowledge_sources" DROP COLUMN "content";
  ALTER TABLE "knowledge_sources" DROP COLUMN "purpose";
  ALTER TABLE "knowledge_sources_rels" DROP COLUMN "variants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "assistant_eval_questions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "assistant_eval_runs_id";
  DROP TYPE "public"."enum_knowledge_sources_purpose";
  DROP TYPE "public"."enum_assistant_eval_questions_category";
  DROP TYPE "public"."enum_assistant_eval_runs_verdict";`)
}
