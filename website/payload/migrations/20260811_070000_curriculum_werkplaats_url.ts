import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Curriculum Werkplaats-kaartje op de publieke Helpdesk-homepage (2026-08-11):
// nieuw, optioneel URL-veld per variant — leeg laat het kaartje verborgen, zie
// payload/collections/Variants.ts en components/molecules/
// CurriculumWerkplaatsCard.tsx. Losse migratie nodig omdat `push` uitstaat
// voor dit project, zie payload.config.ts.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "variants" ADD COLUMN "curriculum_werkplaats_url" varchar;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "variants" DROP COLUMN "curriculum_werkplaats_url";`);
}
