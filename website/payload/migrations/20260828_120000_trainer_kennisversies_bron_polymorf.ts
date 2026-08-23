import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Vervolgronde — Kennisbasis-basiskennis (2026-08-23) — "bron" wordt
// polymorf (articles ÉN knowledge-sources, was uitsluitend articles als
// "sourceArticle") zodat een trainerversie ook rechtstreeks uit de centrale
// Kennisbasis (een knowledge-sources-rij, zie lib/assistant/
// kennisbasis-context.ts) kan komen — geen tweede kennisbron. Zelfde
// tabelvorm als de al bestaande polymorfe relatie kennisbasis_onderwerpen_rels
// (20260727_084413_kennisbasis_onderwerpen.ts, daar "gekoppeldeHandleidingen"
// -> handleidingen/knowledge-sources) — hier hetzelfde patroon voor
// "bron" -> articles/knowledge-sources, hand-geschreven om dezelfde reden als
// de andere trainer-migraties dit project (payload migrate:create loopt hier
// vast op een ongerelateerde interactieve disambiguatievraag).
//
// Data-migratie vóór het droppen van de oude kolom: elke bestaande rij met
// een ingevulde source_article_id krijgt een overeenkomstige rij in de
// nieuwe rels-tabel (path 'bron', articles_id = de oude waarde) — geen
// stille dataverlies, ook al is deze collectie op het moment van schrijven
// nog niet in productie gebruikt.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "trainer_kennisversies_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"articles_id" integer,
  	"knowledge_sources_id" integer
  );

  INSERT INTO "trainer_kennisversies_rels" ("parent_id", "path", "articles_id")
  SELECT "id", 'bron', "source_article_id" FROM "trainer_kennisversies" WHERE "source_article_id" IS NOT NULL;

  DO $$ BEGIN
   ALTER TABLE "trainer_kennisversies_rels" ADD CONSTRAINT "trainer_kennisversies_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trainer_kennisversies"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "trainer_kennisversies_rels" ADD CONSTRAINT "trainer_kennisversies_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
   ALTER TABLE "trainer_kennisversies_rels" ADD CONSTRAINT "trainer_kennisversies_rels_knowledge_sources_fk" FOREIGN KEY ("knowledge_sources_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_rels_order_idx" ON "trainer_kennisversies_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_rels_parent_idx" ON "trainer_kennisversies_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_rels_path_idx" ON "trainer_kennisversies_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_rels_articles_id_idx" ON "trainer_kennisversies_rels" USING btree ("articles_id");
  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_rels_knowledge_sources_id_idx" ON "trainer_kennisversies_rels" USING btree ("knowledge_sources_id");

  ALTER TABLE "trainer_kennisversies" DROP CONSTRAINT IF EXISTS "trainer_kennisversies_source_article_id_articles_id_fk";
  DROP INDEX IF EXISTS "trainer_kennisversies_source_article_idx";
  ALTER TABLE "trainer_kennisversies" DROP COLUMN IF EXISTS "source_article_id";`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainer_kennisversies" ADD COLUMN IF NOT EXISTS "source_article_id" integer;

  UPDATE "trainer_kennisversies" t SET "source_article_id" = r."articles_id"
  FROM "trainer_kennisversies_rels" r WHERE r."parent_id" = t."id" AND r."path" = 'bron' AND r."articles_id" IS NOT NULL;

  DO $$ BEGIN
   ALTER TABLE "trainer_kennisversies" ADD CONSTRAINT "trainer_kennisversies_source_article_id_articles_id_fk" FOREIGN KEY ("source_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "trainer_kennisversies_source_article_idx" ON "trainer_kennisversies" USING btree ("source_article_id");

  DROP TABLE IF EXISTS "trainer_kennisversies_rels" CASCADE;`);
}
