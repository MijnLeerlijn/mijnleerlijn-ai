import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_sales_partners_status" AS ENUM('verkenning', 'actief', 'on_hold', 'gestopt');
    CREATE TYPE "public"."enum_sales_partners_mijlpalen_type" AS ENUM('overeenkomst', 'eerste_actie', 'eerste_lead', 'eerste_klant', 'evaluatie', 'anders');

    CREATE TABLE IF NOT EXISTS "sales_goals" (
      "id" serial PRIMARY KEY NOT NULL,
      "naam" varchar NOT NULL,
      "start_datum" timestamp(3) with time zone NOT NULL,
      "eind_datum" timestamp(3) with time zone NOT NULL,
      "doel_licenties" numeric NOT NULL,
      "actief" boolean DEFAULT true,
      "notitie" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "sales_partners" (
      "id" serial PRIMARY KEY NOT NULL,
      "naam" varchar NOT NULL,
      "start_datum" timestamp(3) with time zone,
      "status" "public"."enum_sales_partners_status" DEFAULT 'actief',
      "verantwoordelijke_id" integer,
      "verwachting" varchar,
      "doel_licenties" numeric,
      "volgende_actie" varchar,
      "volgende_actie_deadline" timestamp(3) with time zone,
      "notities" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "sales_partners_naam_unique" UNIQUE("naam")
    );

    CREATE TABLE IF NOT EXISTS "sales_partners_mijlpalen" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "type" "public"."enum_sales_partners_mijlpalen_type" NOT NULL,
      "datum" timestamp(3) with time zone NOT NULL,
      "toelichting" varchar
    );

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "sales_goals_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "sales_partners_id" integer;

    DO $$ BEGIN
      ALTER TABLE "sales_partners" ADD CONSTRAINT "sales_partners_verantwoordelijke_id_users_id_fk" FOREIGN KEY ("verantwoordelijke_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "sales_partners_mijlpalen" ADD CONSTRAINT "sales_partners_mijlpalen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sales_partners"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sales_goals_fk" FOREIGN KEY ("sales_goals_id") REFERENCES "public"."sales_goals"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sales_partners_fk" FOREIGN KEY ("sales_partners_id") REFERENCES "public"."sales_partners"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE INDEX IF NOT EXISTS "sales_goals_start_datum_idx" ON "sales_goals" USING btree ("start_datum");
    CREATE INDEX IF NOT EXISTS "sales_goals_eind_datum_idx" ON "sales_goals" USING btree ("eind_datum");
    CREATE INDEX IF NOT EXISTS "sales_goals_updated_at_idx" ON "sales_goals" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "sales_goals_created_at_idx" ON "sales_goals" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "sales_partners_verantwoordelijke_idx" ON "sales_partners" USING btree ("verantwoordelijke_id");
    CREATE INDEX IF NOT EXISTS "sales_partners_updated_at_idx" ON "sales_partners" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "sales_partners_created_at_idx" ON "sales_partners" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "sales_partners_mijlpalen_order_idx" ON "sales_partners_mijlpalen" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "sales_partners_mijlpalen_parent_id_idx" ON "sales_partners_mijlpalen" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_sales_goals_id_idx" ON "payload_locked_documents_rels" USING btree ("sales_goals_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_sales_partners_id_idx" ON "payload_locked_documents_rels" USING btree ("sales_partners_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sales_partners_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sales_goals_fk";
    ALTER TABLE "sales_partners_mijlpalen" DROP CONSTRAINT IF EXISTS "sales_partners_mijlpalen_parent_id_fk";
    ALTER TABLE "sales_partners" DROP CONSTRAINT IF EXISTS "sales_partners_verantwoordelijke_id_users_id_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sales_partners_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sales_goals_id";
    DROP TABLE IF EXISTS "sales_partners_mijlpalen" CASCADE;
    DROP TABLE IF EXISTS "sales_partners" CASCADE;
    DROP TABLE IF EXISTS "sales_goals" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_sales_partners_mijlpalen_type";
    DROP TYPE IF EXISTS "public"."enum_sales_partners_status";
  `);
}
