import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_kennisbasis_onderwerpen_status" AS ENUM('concept', 'gepubliceerd');
  CREATE TABLE "kennisbasis_onderwerpen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"onderwerp" varchar NOT NULL,
  	"doel" varchar,
  	"officiele_term" varchar NOT NULL,
  	"toelichting" varchar,
  	"verduidelijkingsvraag" varchar,
  	"prioriteit" numeric,
  	"status" "enum_kennisbasis_onderwerpen_status" DEFAULT 'concept' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "kennisbasis_onderwerpen_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "kennisbasis_onderwerpen_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"handleidingen_id" integer,
  	"knowledge_sources_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "kennisbasis_onderwerpen_id" integer;
  ALTER TABLE "kennisbasis_onderwerpen_texts" ADD CONSTRAINT "kennisbasis_onderwerpen_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."kennisbasis_onderwerpen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kennisbasis_onderwerpen_rels" ADD CONSTRAINT "kennisbasis_onderwerpen_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."kennisbasis_onderwerpen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kennisbasis_onderwerpen_rels" ADD CONSTRAINT "kennisbasis_onderwerpen_rels_handleidingen_fk" FOREIGN KEY ("handleidingen_id") REFERENCES "public"."handleidingen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kennisbasis_onderwerpen_rels" ADD CONSTRAINT "kennisbasis_onderwerpen_rels_knowledge_sources_fk" FOREIGN KEY ("knowledge_sources_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "kennisbasis_onderwerpen_updated_at_idx" ON "kennisbasis_onderwerpen" USING btree ("updated_at");
  CREATE INDEX "kennisbasis_onderwerpen_created_at_idx" ON "kennisbasis_onderwerpen" USING btree ("created_at");
  CREATE INDEX "kennisbasis_onderwerpen_texts_order_parent" ON "kennisbasis_onderwerpen_texts" USING btree ("order","parent_id");
  CREATE INDEX "kennisbasis_onderwerpen_rels_order_idx" ON "kennisbasis_onderwerpen_rels" USING btree ("order");
  CREATE INDEX "kennisbasis_onderwerpen_rels_parent_idx" ON "kennisbasis_onderwerpen_rels" USING btree ("parent_id");
  CREATE INDEX "kennisbasis_onderwerpen_rels_path_idx" ON "kennisbasis_onderwerpen_rels" USING btree ("path");
  CREATE INDEX "kennisbasis_onderwerpen_rels_handleidingen_id_idx" ON "kennisbasis_onderwerpen_rels" USING btree ("handleidingen_id");
  CREATE INDEX "kennisbasis_onderwerpen_rels_knowledge_sources_id_idx" ON "kennisbasis_onderwerpen_rels" USING btree ("knowledge_sources_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_kennisbasis_onderwerpen_fk" FOREIGN KEY ("kennisbasis_onderwerpen_id") REFERENCES "public"."kennisbasis_onderwerpen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_kennisbasis_onderwerpen_id_idx" ON "payload_locked_documents_rels" USING btree ("kennisbasis_onderwerpen_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "kennisbasis_onderwerpen" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "kennisbasis_onderwerpen_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "kennisbasis_onderwerpen_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "kennisbasis_onderwerpen" CASCADE;
  DROP TABLE "kennisbasis_onderwerpen_texts" CASCADE;
  DROP TABLE "kennisbasis_onderwerpen_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_kennisbasis_onderwerpen_fk";
  
  DROP INDEX "payload_locked_documents_rels_kennisbasis_onderwerpen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "kennisbasis_onderwerpen_id";
  DROP TYPE "public"."enum_kennisbasis_onderwerpen_status";`)
}
