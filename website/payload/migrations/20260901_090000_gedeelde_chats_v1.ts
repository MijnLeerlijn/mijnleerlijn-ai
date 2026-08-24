import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Chat delen via URL (2026-08-24) — nieuwe collectie "gedeelde-chats"
// (payload/collections/GedeeldeChats.ts). Handgeschreven, zelfde reden als
// elke andere migratie in dit project: `payload migrate:create` toont hier
// (ook zonder enige eigen wijziging, geverifieerd tegen een schone, vers
// gemigreerde database) een onterechte interactieve rename-vraag over
// "trainer_accounts_sessions"/"helpdesk_voorbeeldvragen" — een bestaande,
// van dit werk losstaande eigenaardigheid van de generator, niet iets om
// hier blindelings te beantwoorden. Structuur/naamgeving hieronder is
// letterlijk gespiegeld aan twee bestaande migraties met dezelfde vorm:
// 20260723_163206_add_assistant_conversations.ts (top-level tabel + één
// array-veld) en 20260726_084003_handleidingen_en_voorbeeldvragen.ts (een
// array-in-een-array, "stappen" → "media" — hier "berichten" → "steps" →
// "images"). "bronConversaties" (hasMany-relatie naar assistant-conversations)
// volgt dezelfde `_rels`-tabelvorm als trainer_bestanden_rels.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "gedeelde_chats_berichten_manuals" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"manual_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"has_file" boolean DEFAULT false
  );

  CREATE TABLE IF NOT EXISTS "gedeelde_chats_berichten_steps_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"caption" varchar,
  	"alt" varchar NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "gedeelde_chats_berichten_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"handleiding_id" integer NOT NULL,
  	"handleiding_slug" varchar NOT NULL,
  	"handleiding_titel" varchar NOT NULL,
  	"handleiding_url" varchar NOT NULL,
  	"step_id" varchar NOT NULL,
  	"step_nummer" integer NOT NULL,
  	"titel" varchar NOT NULL,
  	"uitleg" varchar NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "gedeelde_chats_berichten" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"vraag" varchar NOT NULL,
  	"antwoord" varchar NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "gedeelde_chats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"token_hash" varchar NOT NULL,
  	"revoked_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "gedeelde_chats_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"assistant_conversations_id" integer
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "gedeelde_chats_id" integer;

  DO $$ BEGIN
   ALTER TABLE "gedeelde_chats_berichten_manuals" ADD CONSTRAINT "gedeelde_chats_berichten_manuals_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."gedeelde_chats_berichten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "gedeelde_chats_berichten_steps_images" ADD CONSTRAINT "gedeelde_chats_berichten_steps_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."gedeelde_chats_berichten_steps"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "gedeelde_chats_berichten_steps" ADD CONSTRAINT "gedeelde_chats_berichten_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."gedeelde_chats_berichten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "gedeelde_chats_berichten" ADD CONSTRAINT "gedeelde_chats_berichten_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."gedeelde_chats"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "gedeelde_chats_rels" ADD CONSTRAINT "gedeelde_chats_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gedeelde_chats"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "gedeelde_chats_rels" ADD CONSTRAINT "gedeelde_chats_rels_assistant_conversations_fk" FOREIGN KEY ("assistant_conversations_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_gedeelde_chats_fk" FOREIGN KEY ("gedeelde_chats_id") REFERENCES "public"."gedeelde_chats"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "gedeelde_chats_berichten_manuals_order_idx" ON "gedeelde_chats_berichten_manuals" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_berichten_manuals_parent_id_idx" ON "gedeelde_chats_berichten_manuals" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_berichten_steps_images_order_idx" ON "gedeelde_chats_berichten_steps_images" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_berichten_steps_images_parent_id_idx" ON "gedeelde_chats_berichten_steps_images" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_berichten_steps_order_idx" ON "gedeelde_chats_berichten_steps" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_berichten_steps_parent_id_idx" ON "gedeelde_chats_berichten_steps" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_berichten_order_idx" ON "gedeelde_chats_berichten" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_berichten_parent_id_idx" ON "gedeelde_chats_berichten" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "gedeelde_chats_token_hash_idx" ON "gedeelde_chats" USING btree ("token_hash");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_updated_at_idx" ON "gedeelde_chats" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_created_at_idx" ON "gedeelde_chats" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_rels_order_idx" ON "gedeelde_chats_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_rels_parent_idx" ON "gedeelde_chats_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_rels_path_idx" ON "gedeelde_chats_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "gedeelde_chats_rels_assistant_conversations_id_idx" ON "gedeelde_chats_rels" USING btree ("assistant_conversations_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_gedeelde_chats_id_idx" ON "payload_locked_documents_rels" USING btree ("gedeelde_chats_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "payload_locked_documents_rels_gedeelde_chats_id_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_rels_assistant_conversations_id_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_rels_path_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_rels_parent_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_rels_order_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_created_at_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_updated_at_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_token_hash_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_berichten_parent_id_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_berichten_order_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_berichten_steps_parent_id_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_berichten_steps_order_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_berichten_steps_images_parent_id_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_berichten_steps_images_order_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_berichten_manuals_parent_id_idx";
  DROP INDEX IF EXISTS "gedeelde_chats_berichten_manuals_order_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_gedeelde_chats_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "gedeelde_chats_id";

  DROP TABLE IF EXISTS "gedeelde_chats_rels" CASCADE;
  DROP TABLE IF EXISTS "gedeelde_chats" CASCADE;
  DROP TABLE IF EXISTS "gedeelde_chats_berichten" CASCADE;
  DROP TABLE IF EXISTS "gedeelde_chats_berichten_steps" CASCADE;
  DROP TABLE IF EXISTS "gedeelde_chats_berichten_steps_images" CASCADE;
  DROP TABLE IF EXISTS "gedeelde_chats_berichten_manuals" CASCADE;`);
}
