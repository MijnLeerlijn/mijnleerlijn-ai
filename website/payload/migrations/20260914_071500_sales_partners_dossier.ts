import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Breidt het partnerdossier uit met een doelperiode, contactlogboek en
// actiehistorie. Commerciële schoolresultaten blijven uit Monday komen.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_sales_partners_contactmomenten_type" AS ENUM('gesprek', 'meeting', 'email', 'actie_event', 'evaluatie', 'overig');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    ALTER TABLE "sales_partners" ADD COLUMN IF NOT EXISTS "doel_start_datum" timestamp(3) with time zone;
    ALTER TABLE "sales_partners" ADD COLUMN IF NOT EXISTS "doel_eind_datum" timestamp(3) with time zone;

    CREATE TABLE IF NOT EXISTS "sales_partners_contactmomenten" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "datum" timestamp(3) with time zone NOT NULL,
      "type" "enum_sales_partners_contactmomenten_type" DEFAULT 'overig' NOT NULL,
      "samenvatting" varchar NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "sales_partners_acties" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "actie" varchar NOT NULL,
      "deadline" timestamp(3) with time zone,
      "afgerond" boolean DEFAULT false,
      "afgerond_op" timestamp(3) with time zone
    );

    DO $$ BEGIN
      ALTER TABLE "sales_partners_contactmomenten" ADD CONSTRAINT "sales_partners_contactmomenten_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sales_partners"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "sales_partners_acties" ADD CONSTRAINT "sales_partners_acties_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sales_partners"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "sales_partners_contactmomenten_order_idx" ON "sales_partners_contactmomenten" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "sales_partners_contactmomenten_parent_id_idx" ON "sales_partners_contactmomenten" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "sales_partners_acties_order_idx" ON "sales_partners_acties" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "sales_partners_acties_parent_id_idx" ON "sales_partners_acties" USING btree ("_parent_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "sales_partners_acties" DROP CONSTRAINT IF EXISTS "sales_partners_acties_parent_id_fk";
    ALTER TABLE "sales_partners_contactmomenten" DROP CONSTRAINT IF EXISTS "sales_partners_contactmomenten_parent_id_fk";
    DROP TABLE IF EXISTS "sales_partners_acties" CASCADE;
    DROP TABLE IF EXISTS "sales_partners_contactmomenten" CASCADE;
    ALTER TABLE "sales_partners" DROP COLUMN IF EXISTS "doel_eind_datum";
    ALTER TABLE "sales_partners" DROP COLUMN IF EXISTS "doel_start_datum";
    DROP TYPE IF EXISTS "public"."enum_sales_partners_contactmomenten_type";
  `);
}
