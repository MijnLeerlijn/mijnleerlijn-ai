import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_answer_feedback_rating" AS ENUM('nuttig', 'niet_nuttig');
  CREATE TABLE "answer_feedback" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"vraag" varchar NOT NULL,
  	"antwoord_tekst" varchar NOT NULL,
  	"variant_id" integer,
  	"rating" "enum_answer_feedback_rating" NOT NULL,
  	"page_url" varchar,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "answer_feedback_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "answer_feedback_id" integer;
  ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "answer_feedback_texts" ADD CONSTRAINT "answer_feedback_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."answer_feedback"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "answer_feedback_variant_idx" ON "answer_feedback" USING btree ("variant_id");
  CREATE INDEX "answer_feedback_updated_at_idx" ON "answer_feedback" USING btree ("updated_at");
  CREATE INDEX "answer_feedback_texts_order_parent" ON "answer_feedback_texts" USING btree ("order","parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_answer_feedback_fk" FOREIGN KEY ("answer_feedback_id") REFERENCES "public"."answer_feedback"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_answer_feedback_id_idx" ON "payload_locked_documents_rels" USING btree ("answer_feedback_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "answer_feedback" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "answer_feedback_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "answer_feedback" CASCADE;
  DROP TABLE "answer_feedback_texts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_answer_feedback_fk";
  
  DROP INDEX "payload_locked_documents_rels_answer_feedback_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "answer_feedback_id";
  DROP TYPE "public"."enum_answer_feedback_rating";`);
}
