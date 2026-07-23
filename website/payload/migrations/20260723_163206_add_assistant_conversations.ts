import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Handmatig gehard na `payload migrate:create`, zelfde patroon als de
// eerdere migraties: idempotent met IF NOT EXISTS / DO-blokken. Raakt geen
// bestaande tabellen behalve de standaard, nullable ADD COLUMN op
// payload_locked_documents_rels.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
   CREATE TYPE "public"."enum_assistant_conversations_feedback_rating" AS ENUM('geen', 'nuttig', 'niet_nuttig');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  CREATE TABLE IF NOT EXISTS "assistant_conversations_sources" (
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

  CREATE TABLE IF NOT EXISTS "assistant_conversations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"has_answer" boolean DEFAULT false NOT NULL,
  	"answer" varchar NOT NULL,
  	"reasoning" varchar,
  	"confidence" numeric NOT NULL,
  	"model" varchar,
  	"input_tokens" numeric,
  	"output_tokens" numeric,
  	"total_tokens" numeric,
  	"answer_time_ms" numeric,
  	"feedback_rating" "enum_assistant_conversations_feedback_rating" DEFAULT 'geen' NOT NULL,
  	"feedback_missing" varchar,
  	"user_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "assistant_conversations_id" integer;
  DO $$ BEGIN
   ALTER TABLE "assistant_conversations_sources" ADD CONSTRAINT "assistant_conversations_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
   ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  CREATE INDEX IF NOT EXISTS "assistant_conversations_sources_order_idx" ON "assistant_conversations_sources" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "assistant_conversations_sources_parent_id_idx" ON "assistant_conversations_sources" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "assistant_conversations_user_idx" ON "assistant_conversations" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "assistant_conversations_updated_at_idx" ON "assistant_conversations" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "assistant_conversations_created_at_idx" ON "assistant_conversations" USING btree ("created_at");
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_assistant_conversations_fk" FOREIGN KEY ("assistant_conversations_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_assistant_conversations_id_idx" ON "payload_locked_documents_rels" USING btree ("assistant_conversations_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "assistant_conversations_sources" CASCADE;
  DROP TABLE IF EXISTS "assistant_conversations" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_assistant_conversations_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_assistant_conversations_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "assistant_conversations_id";
  DROP TYPE IF EXISTS "public"."enum_assistant_conversations_feedback_rating";`);
}
