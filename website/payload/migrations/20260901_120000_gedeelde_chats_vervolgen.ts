import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Gesprek delen — vervolgen (2026-09-01, opdracht "Gesprek delen"-herbouw):
// enige schemawijziging voor de nieuwe fork/vervolg-flow — de rest (parent-
// share-resolutie, gespreksgeschiedenis-context) is puur bestaande data
// anders combineren, geen nieuwe kolommen nodig. Additief, zelfde
// ADD COLUMN IF NOT EXISTS-patroon als elke andere migratie in dit project —
// bestaande "gedeelde-chats"-rijen (incl. de rijen van vóór deze ronde)
// blijven ongewijzigd leesbaar/werkend, zie GedeeldeChats.ts se toelichting
// bij "hasAnswer".
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "gedeelde_chats_berichten" ADD COLUMN IF NOT EXISTS "has_answer" boolean DEFAULT true;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "gedeelde_chats_berichten" DROP COLUMN IF EXISTS "has_answer";`);
}
