import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Trainertelefonie V1-afronding (2026-08-26) — spec §7/§10/§11/§17: één
// nieuwe, expliciet NIET-technische status ('verslag_bestaat_al' — de
// verliezende kant van een race tussen twee gelijktijdige gesprekken die
// dezelfde training claimen, zie lib/trainers/verslag.ts se upsertConcept)
// + één nieuwe teller (heropnamePogingen — hoe vaak de trainer de opname via
// '*' heeft afgewezen en opnieuw is begonnen, zelfde precedent als
// transcriptiePogingen).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_trainer_telefonie_oproepen_status" ADD VALUE IF NOT EXISTS 'verslag_bestaat_al';

  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "heropname_pogingen" numeric DEFAULT 0 NOT NULL;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "heropname_pogingen";

  -- Enum-waarde zelf NIET verwijderd (Postgres kent geen ALTER TYPE ...
  -- DROP VALUE) — zelfde, structurele beperking als elders in dit project.
  -- Een ongebruikte waarde op een enum is onschadelijk.`);
}
