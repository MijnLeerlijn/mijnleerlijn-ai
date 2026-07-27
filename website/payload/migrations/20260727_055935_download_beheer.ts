import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "handleidingen" ALTER COLUMN "categorie_id" DROP NOT NULL;
  ALTER TABLE "handleidingen" ALTER COLUMN "versie" DROP DEFAULT;
  ALTER TABLE "categories" ADD COLUMN "volgorde" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "handleidingen" ALTER COLUMN "categorie_id" SET NOT NULL;
  ALTER TABLE "handleidingen" ALTER COLUMN "versie" SET DEFAULT 1;
  ALTER TABLE "categories" DROP COLUMN "volgorde";`)
}
