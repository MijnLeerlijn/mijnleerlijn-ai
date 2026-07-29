import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Homepage-herontwerp (2026-07-29): nieuwe collectie, vervangt de vaste lijst
// in de Global "helpdesk-voorbeeldvragen" (payload/globals/HelpdeskVoorbeeldvragen.ts,
// blijft ongewijzigd/ongebruikt in de database staan — bewust GEEN rename,
// een andere slug/tabelnaam om elk conflict met de bestaande Global-tabel te
// vermijden). Handmatig geschreven i.p.v. via `payload migrate:create`: de
// interactieve create/rename-prompt van die CLI-stap draait niet non-interactief
// in deze omgeving. Zelfde CREATE-TABLE-structuur als eerdere, vergelijkbaar
// eenvoudige (geen relationship-/array-velden) collecties, bv.
// 20260722_083119_add_answer_feedback.ts.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "helpdesk_vragen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"vraag" varchar NOT NULL,
  	"vraag_normalized" varchar NOT NULL,
  	"aantal_gesteld" numeric DEFAULT 0 NOT NULL,
  	"laatst_gebruikt_op" timestamp(3) with time zone,
  	"pinned" boolean DEFAULT false,
  	"pin_volgorde" numeric,
  	"verborgen" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "helpdesk_vragen_id" integer;
  CREATE UNIQUE INDEX "helpdesk_vragen_vraag_normalized_idx" ON "helpdesk_vragen" USING btree ("vraag_normalized");
  CREATE INDEX "helpdesk_vragen_updated_at_idx" ON "helpdesk_vragen" USING btree ("updated_at");
  CREATE INDEX "helpdesk_vragen_created_at_idx" ON "helpdesk_vragen" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_helpdesk_vragen_fk" FOREIGN KEY ("helpdesk_vragen_id") REFERENCES "public"."helpdesk_vragen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_helpdesk_vragen_id_idx" ON "payload_locked_documents_rels" USING btree ("helpdesk_vragen_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "helpdesk_vragen" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "helpdesk_vragen" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_helpdesk_vragen_fk";

  DROP INDEX "payload_locked_documents_rels_helpdesk_vragen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "helpdesk_vragen_id";`);
}
