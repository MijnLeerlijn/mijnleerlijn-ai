import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_handleidingen_stappen_embedding_status" AS ENUM('pending', 'indexed', 'stale');
  CREATE TYPE "public"."enum_handleidingen_status" AS ENUM('concept', 'gepubliceerd', 'gearchiveerd');
  CREATE TYPE "public"."enum_handleidingen_embedding_status" AS ENUM('pending', 'indexed', 'stale');
  CREATE TABLE "handleidingen_stappen_media" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"bestand_id" integer NOT NULL,
  	"onderschrift" varchar
  );
  
  CREATE TABLE "handleidingen_stappen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titel" varchar NOT NULL,
  	"uitleg" jsonb NOT NULL,
  	"waarschuwing" varchar,
  	"tip" varchar,
  	"knop_of_schermnaam" varchar,
  	"interne_notitie" varchar,
  	"verborgen" boolean DEFAULT false,
  	"embedding_status" "enum_handleidingen_stappen_embedding_status" DEFAULT 'pending',
  	"embedding_text_hash" varchar,
  	"embedding" jsonb
  );
  
  CREATE TABLE "handleidingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"intern_titel" varchar NOT NULL,
  	"titel" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"korte_omschrijving" varchar NOT NULL,
  	"categorie_id" integer NOT NULL,
  	"status" "enum_handleidingen_status" DEFAULT 'concept' NOT NULL,
  	"zichtbaar_in_sidebar" boolean DEFAULT false,
  	"volgorde" numeric,
  	"laatst_bijgewerkt" timestamp(3) with time zone,
  	"legacy_bron_id" integer,
  	"versie" numeric DEFAULT 1,
  	"gepubliceerd_op" timestamp(3) with time zone,
  	"gepubliceerd_door_id" integer,
  	"embedding_status" "enum_handleidingen_embedding_status" DEFAULT 'pending' NOT NULL,
  	"embedded_at" timestamp(3) with time zone,
  	"embedding_model" varchar,
  	"embedding_text_hash" varchar,
  	"embedding" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "handleidingen_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "handleidingen_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variants_id" integer
  );
  
  CREATE TABLE "helpdesk_voorbeeldvragen_vragen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tekst" varchar NOT NULL
  );
  
  CREATE TABLE "helpdesk_voorbeeldvragen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "handleidingen_id" integer;
  ALTER TABLE "handleidingen_stappen_media" ADD CONSTRAINT "handleidingen_stappen_media_bestand_id_media_id_fk" FOREIGN KEY ("bestand_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "handleidingen_stappen_media" ADD CONSTRAINT "handleidingen_stappen_media_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."handleidingen_stappen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "handleidingen_stappen" ADD CONSTRAINT "handleidingen_stappen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."handleidingen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "handleidingen" ADD CONSTRAINT "handleidingen_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "handleidingen" ADD CONSTRAINT "handleidingen_legacy_bron_id_knowledge_sources_id_fk" FOREIGN KEY ("legacy_bron_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "handleidingen" ADD CONSTRAINT "handleidingen_gepubliceerd_door_id_users_id_fk" FOREIGN KEY ("gepubliceerd_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "handleidingen_texts" ADD CONSTRAINT "handleidingen_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."handleidingen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "handleidingen_rels" ADD CONSTRAINT "handleidingen_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."handleidingen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "handleidingen_rels" ADD CONSTRAINT "handleidingen_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "helpdesk_voorbeeldvragen_vragen" ADD CONSTRAINT "helpdesk_voorbeeldvragen_vragen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."helpdesk_voorbeeldvragen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "handleidingen_stappen_media_order_idx" ON "handleidingen_stappen_media" USING btree ("_order");
  CREATE INDEX "handleidingen_stappen_media_parent_id_idx" ON "handleidingen_stappen_media" USING btree ("_parent_id");
  CREATE INDEX "handleidingen_stappen_media_bestand_idx" ON "handleidingen_stappen_media" USING btree ("bestand_id");
  CREATE INDEX "handleidingen_stappen_order_idx" ON "handleidingen_stappen" USING btree ("_order");
  CREATE INDEX "handleidingen_stappen_parent_id_idx" ON "handleidingen_stappen" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "handleidingen_slug_idx" ON "handleidingen" USING btree ("slug");
  CREATE INDEX "handleidingen_categorie_idx" ON "handleidingen" USING btree ("categorie_id");
  CREATE INDEX "handleidingen_legacy_bron_idx" ON "handleidingen" USING btree ("legacy_bron_id");
  CREATE INDEX "handleidingen_gepubliceerd_door_idx" ON "handleidingen" USING btree ("gepubliceerd_door_id");
  CREATE INDEX "handleidingen_updated_at_idx" ON "handleidingen" USING btree ("updated_at");
  CREATE INDEX "handleidingen_created_at_idx" ON "handleidingen" USING btree ("created_at");
  CREATE INDEX "handleidingen_texts_order_parent" ON "handleidingen_texts" USING btree ("order","parent_id");
  CREATE INDEX "handleidingen_rels_order_idx" ON "handleidingen_rels" USING btree ("order");
  CREATE INDEX "handleidingen_rels_parent_idx" ON "handleidingen_rels" USING btree ("parent_id");
  CREATE INDEX "handleidingen_rels_path_idx" ON "handleidingen_rels" USING btree ("path");
  CREATE INDEX "handleidingen_rels_variants_id_idx" ON "handleidingen_rels" USING btree ("variants_id");
  CREATE INDEX "helpdesk_voorbeeldvragen_vragen_order_idx" ON "helpdesk_voorbeeldvragen_vragen" USING btree ("_order");
  CREATE INDEX "helpdesk_voorbeeldvragen_vragen_parent_id_idx" ON "helpdesk_voorbeeldvragen_vragen" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_handleidingen_fk" FOREIGN KEY ("handleidingen_id") REFERENCES "public"."handleidingen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_handleidingen_id_idx" ON "payload_locked_documents_rels" USING btree ("handleidingen_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "handleidingen_stappen_media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "handleidingen_stappen" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "handleidingen" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "handleidingen_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "handleidingen_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "helpdesk_voorbeeldvragen_vragen" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "helpdesk_voorbeeldvragen" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "handleidingen_stappen_media" CASCADE;
  DROP TABLE "handleidingen_stappen" CASCADE;
  DROP TABLE "handleidingen" CASCADE;
  DROP TABLE "handleidingen_texts" CASCADE;
  DROP TABLE "handleidingen_rels" CASCADE;
  DROP TABLE "helpdesk_voorbeeldvragen_vragen" CASCADE;
  DROP TABLE "helpdesk_voorbeeldvragen" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_handleidingen_fk";
  
  DROP INDEX "payload_locked_documents_rels_handleidingen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "handleidingen_id";
  DROP TYPE "public"."enum_handleidingen_stappen_embedding_status";
  DROP TYPE "public"."enum_handleidingen_status";
  DROP TYPE "public"."enum_handleidingen_embedding_status";`)
}
