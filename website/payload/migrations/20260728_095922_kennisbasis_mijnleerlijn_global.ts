import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_kennisbasis_mijnleerlijn_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__kennisbasis_mijnleerlijn_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "kennisbasis_mijnleerlijn" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titel" varchar DEFAULT 'Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI',
  	"inhoud" jsonb,
  	"_status" "enum_kennisbasis_mijnleerlijn_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "_kennisbasis_mijnleerlijn_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_titel" varchar DEFAULT 'Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI',
  	"version_inhoud" jsonb,
  	"version__status" "enum__kennisbasis_mijnleerlijn_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE INDEX "kennisbasis_mijnleerlijn__status_idx" ON "kennisbasis_mijnleerlijn" USING btree ("_status");
  CREATE INDEX "_kennisbasis_mijnleerlijn_v_version_version__status_idx" ON "_kennisbasis_mijnleerlijn_v" USING btree ("version__status");
  CREATE INDEX "_kennisbasis_mijnleerlijn_v_created_at_idx" ON "_kennisbasis_mijnleerlijn_v" USING btree ("created_at");
  CREATE INDEX "_kennisbasis_mijnleerlijn_v_updated_at_idx" ON "_kennisbasis_mijnleerlijn_v" USING btree ("updated_at");
  CREATE INDEX "_kennisbasis_mijnleerlijn_v_latest_idx" ON "_kennisbasis_mijnleerlijn_v" USING btree ("latest");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "kennisbasis_mijnleerlijn" CASCADE;
  DROP TABLE "_kennisbasis_mijnleerlijn_v" CASCADE;
  DROP TYPE "public"."enum_kennisbasis_mijnleerlijn_status";
  DROP TYPE "public"."enum__kennisbasis_mijnleerlijn_v_version_status";`)
}
