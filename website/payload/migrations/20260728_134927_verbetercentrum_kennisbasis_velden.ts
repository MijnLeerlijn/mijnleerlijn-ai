import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "assistant_conversations" ADD COLUMN "centrale_kennisbasis_gebruikt" boolean DEFAULT false;
  ALTER TABLE "assistant_conversations" ADD COLUMN "centrale_kennisbasis_version" varchar;
  ALTER TABLE "assistant_conversations" ADD COLUMN "tegenstrijdigheid" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "assistant_conversations" DROP COLUMN "centrale_kennisbasis_gebruikt";
  ALTER TABLE "assistant_conversations" DROP COLUMN "centrale_kennisbasis_version";
  ALTER TABLE "assistant_conversations" DROP COLUMN "tegenstrijdigheid";`)
}
