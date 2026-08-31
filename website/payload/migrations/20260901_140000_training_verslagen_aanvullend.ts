import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Upsell-ronde (2026-09-02) — "training-verslagen" (payload/collections/
// TrainingVerslagen.ts) hergebruikt voor aanvullende trainingen i.p.v. een
// tweede verslagmodel (opdrachtseis). Twee additieve wijzigingen:
//
// 1. "monday_trainerboard_item_id" wordt NULLABLE — een aanvullende training
//    heeft per definitie geen Monday-trainerboard-spiegelitem (ze bestaat
//    nooit in Monday). Bestaande MijnLeerlijn-verslagen behouden hun waarde
//    ongewijzigd; alleen de NOT NULL-eis vervalt.
// 2. "training_bron" (nieuw, default 'mijnleerlijn') — onderscheidt of dit
//    verslag bij een Monday-training hoort of bij een lokale aanvullende
//    training (lib/trainers/verslag.ts gebruikt dit om de Monday-
//    statusafronding (werkTrainingBij) uitsluitend voor 'mijnleerlijn' te
//    proberen — een aanvullende training heeft niets op Monday om af te
//    ronden). Bestaande rijen zijn per definitie allemaal MijnLeerlijn-
//    verslagen, dus de default dekt ze correct zonder aparte backfill-stap.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_training_verslagen_training_bron" AS ENUM('mijnleerlijn', 'aanvullend');

  ALTER TABLE "training_verslagen" ALTER COLUMN "monday_trainerboard_item_id" DROP NOT NULL;
  ALTER TABLE "training_verslagen" ADD COLUMN IF NOT EXISTS "training_bron" "public"."enum_training_verslagen_training_bron" DEFAULT 'mijnleerlijn' NOT NULL;`);
}

// LET OP bij down(): "SET NOT NULL" hieronder faalt hard zodra er
// inmiddels verslagen van aanvullende trainingen bestaan (die hebben per
// definitie NULL in deze kolom) — bewust geen stille data-verwijdering hier
// om dat te voorkomen. Terugdraaien is dan alleen mogelijk ná het handmatig
// verwijderen/migreren van die rijen.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "training_verslagen" DROP COLUMN IF EXISTS "training_bron";
  ALTER TABLE "training_verslagen" ALTER COLUMN "monday_trainerboard_item_id" SET NOT NULL;

  DROP TYPE IF EXISTS "public"."enum_training_verslagen_training_bron";`);
}
