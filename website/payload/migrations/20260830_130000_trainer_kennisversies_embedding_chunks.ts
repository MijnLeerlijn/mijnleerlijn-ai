import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// "Hoofdstuknavigatie + bronverwijzing naar juiste hoofdstuk" (2026-08-24) —
// nieuw veld embeddingChunks op trainer-kennisversies (payload/collections/
// TrainerKennisversies.ts): hoofdstuk-metadata per embedding-chunk
// (heading/headingSlug/headingLevel/chunkIndex), index-uitgelijnd met het
// bestaande `embedding`-veld. Hand-geschreven, zelfde reden als de eerdere
// trainer-migraties dit project (payload migrate:create loopt hier vast op
// een ongerelateerde interactieve disambiguatievraag). Puur additief: geen
// bestaande kolom/data wijzigt, dus geen datamigratie nodig — bestaande
// records hebben simpelweg embedding_chunks IS NULL totdat ze herindexeren
// (lib/trainers/kennis-reindex.ts herkent dat als "moet opnieuw").

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainer_kennisversies" ADD COLUMN IF NOT EXISTS "embedding_chunks" jsonb;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainer_kennisversies" DROP COLUMN IF EXISTS "embedding_chunks";`);
}
