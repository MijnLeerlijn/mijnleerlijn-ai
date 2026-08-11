import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Curriculum Werkplaats-kaartje op de publieke Helpdesk-homepage: bij nader
// inzien geen variant-specifieke koppeling maar één centrale URL voor de
// hele Helpdesk (vervangt het eerdere `curriculumWerkplaatsUrl`-veld op
// `variants`, dat nooit tegen een echte database is toegepast). Nieuwe
// Global "Helpdesk-instellingen" — publiek leesbaar, door elke editor
// bewerkbaar (zie payload/globals/HelpdeskInstellingen.ts en
// payload/access/roles.ts anyEditor), zelfde tabelvorm als de bestaande
// Global helpdesk_voorbeeldvragen. Losse migratie nodig omdat `push`
// uitstaat voor dit project, zie payload.config.ts.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "helpdesk_instellingen" (
   	"id" serial PRIMARY KEY NOT NULL,
   	"curriculum_werkplaats_url" varchar,
   	"updated_at" timestamp(3) with time zone,
   	"created_at" timestamp(3) with time zone
   );`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "helpdesk_instellingen" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "helpdesk_instellingen" CASCADE;`);
}
