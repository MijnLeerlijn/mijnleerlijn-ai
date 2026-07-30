import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Multi-brand variants (2026-07-30): bundelt alle schemawijzigingen voor
// deze feature in één migratie, zie het technisch ontwerp:
// 1. variants: nieuw `actief`-veld (los van `status`, bepaalt bereikbaarheid)
//    en het `websiteTeksten`-groepsveld (6 optionele publieke teksten).
// 2. kennisbasis_onderwerpen: nieuw `variantContext`-relatieveld — de
//    bestaande `_rels`-tabel krijgt alleen een extra kolom (had al een
//    polymorfe relatie voor `gekoppeldeHandleidingen`).
// 3. helpdesk_vragen: nieuw `variantContext`-relatieveld — HAD nog geen
//    `_rels`-tabel (geen eerder relatieveld), dus die wordt hier aangemaakt.
// 4. assistant_conversations: nieuw, enkelvoudig `variant`-relatieveld
//    (rechtstreeks een kolom, geen `_rels`-tabel nodig — één gesprek hoort
//    bij precies één variant) voor lekkage-steekproefcontroles.
// 5. helpdesk_vragen.vraag_normalized: de kolombrede UNIQUE-index (uit de
//    oorspronkelijke, pre-variant migratie) vervangen door een gewone index
//    — uniciteit is nu per variant vereist, geen kolombrede constraint kan
//    dat combineren met het variantContext-hasMany-veld. Ontdekt via een
//    echte lokale test: dezelfde vraagtekst in twee varianten liep hier
//    stuk op de oude globale unique-constraint (non-blocking afgevangen,
//    dus onzichtbaar voor de bezoeker, maar de telling ging stilzwijgend
//    verloren). Zie payload/collections/HelpdeskVragen.ts.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "variants" ADD COLUMN "actief" boolean DEFAULT false;
  ALTER TABLE "variants" ADD COLUMN "website_teksten_welkomsttitel" varchar;
  ALTER TABLE "variants" ADD COLUMN "website_teksten_welkomsttekst" varchar;
  ALTER TABLE "variants" ADD COLUMN "website_teksten_zoekveld_placeholder" varchar;
  ALTER TABLE "variants" ADD COLUMN "website_teksten_helpdesk_intro" varchar;
  ALTER TABLE "variants" ADD COLUMN "website_teksten_contact_tekst" varchar;
  ALTER TABLE "variants" ADD COLUMN "website_teksten_footer_tekst" varchar;

  ALTER TABLE "kennisbasis_onderwerpen_rels" ADD COLUMN "variants_id" integer;
  ALTER TABLE "kennisbasis_onderwerpen_rels" ADD CONSTRAINT "kennisbasis_onderwerpen_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE CASCADE;
  CREATE INDEX "kennisbasis_onderwerpen_rels_variants_id_idx" ON "kennisbasis_onderwerpen_rels" USING btree ("variants_id");

  CREATE TABLE "helpdesk_vragen_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variants_id" integer
  );
  ALTER TABLE "helpdesk_vragen_rels" ADD CONSTRAINT "helpdesk_vragen_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."helpdesk_vragen"("id") ON DELETE CASCADE;
  ALTER TABLE "helpdesk_vragen_rels" ADD CONSTRAINT "helpdesk_vragen_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE CASCADE;
  CREATE INDEX "helpdesk_vragen_rels_order_idx" ON "helpdesk_vragen_rels" USING btree ("order");
  CREATE INDEX "helpdesk_vragen_rels_parent_idx" ON "helpdesk_vragen_rels" USING btree ("parent_id");
  CREATE INDEX "helpdesk_vragen_rels_path_idx" ON "helpdesk_vragen_rels" USING btree ("path");
  CREATE INDEX "helpdesk_vragen_rels_variants_id_idx" ON "helpdesk_vragen_rels" USING btree ("variants_id");

  ALTER TABLE "assistant_conversations" ADD COLUMN "variant_id" integer;
  ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE SET NULL;
  CREATE INDEX "assistant_conversations_variant_idx" ON "assistant_conversations" USING btree ("variant_id");

  DROP INDEX "helpdesk_vragen_vraag_normalized_idx";
  CREATE INDEX "helpdesk_vragen_vraag_normalized_idx" ON "helpdesk_vragen" USING btree ("vraag_normalized");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "helpdesk_vragen_vraag_normalized_idx";
  CREATE UNIQUE INDEX "helpdesk_vragen_vraag_normalized_idx" ON "helpdesk_vragen" USING btree ("vraag_normalized");

  ALTER TABLE "assistant_conversations" DROP CONSTRAINT "assistant_conversations_variant_id_variants_id_fk";
  DROP INDEX "assistant_conversations_variant_idx";
  ALTER TABLE "assistant_conversations" DROP COLUMN "variant_id";

  DROP TABLE "helpdesk_vragen_rels" CASCADE;

  ALTER TABLE "kennisbasis_onderwerpen_rels" DROP CONSTRAINT "kennisbasis_onderwerpen_rels_variants_fk";
  DROP INDEX "kennisbasis_onderwerpen_rels_variants_id_idx";
  ALTER TABLE "kennisbasis_onderwerpen_rels" DROP COLUMN "variants_id";

  ALTER TABLE "variants" DROP COLUMN "actief";
  ALTER TABLE "variants" DROP COLUMN "website_teksten_welkomsttitel";
  ALTER TABLE "variants" DROP COLUMN "website_teksten_welkomsttekst";
  ALTER TABLE "variants" DROP COLUMN "website_teksten_zoekveld_placeholder";
  ALTER TABLE "variants" DROP COLUMN "website_teksten_helpdesk_intro";
  ALTER TABLE "variants" DROP COLUMN "website_teksten_contact_tekst";
  ALTER TABLE "variants" DROP COLUMN "website_teksten_footer_tekst";`);
}
