import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lesplan_analytics" (
      "id" serial PRIMARY KEY NOT NULL,
      "requested_at" timestamp(3) with time zone NOT NULL,
      "subject" varchar NOT NULL,
      "raw_goal" varchar NOT NULL,
      "normalized_goal" varchar NOT NULL,
      "topic" varchar,
      "age_group" varchar,
      "plan_title" varchar,
      "source" varchar DEFAULT 'lesplangenerator11',
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "lesplan_analytics_id" integer;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lesplan_analytics_fk" FOREIGN KEY ("lesplan_analytics_id") REFERENCES "public"."lesplan_analytics"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "lesplan_analytics_requested_at_idx" ON "lesplan_analytics" USING btree ("requested_at");
    CREATE INDEX IF NOT EXISTS "lesplan_analytics_subject_idx" ON "lesplan_analytics" USING btree ("subject");
    CREATE INDEX IF NOT EXISTS "lesplan_analytics_normalized_goal_idx" ON "lesplan_analytics" USING btree ("normalized_goal");
    CREATE INDEX IF NOT EXISTS "lesplan_analytics_topic_idx" ON "lesplan_analytics" USING btree ("topic");
    CREATE INDEX IF NOT EXISTS "lesplan_analytics_age_group_idx" ON "lesplan_analytics" USING btree ("age_group");
    CREATE INDEX IF NOT EXISTS "lesplan_analytics_updated_at_idx" ON "lesplan_analytics" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "lesplan_analytics_created_at_idx" ON "lesplan_analytics" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_lesplan_analytics_id_idx" ON "payload_locked_documents_rels" USING btree ("lesplan_analytics_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_lesplan_analytics_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "lesplan_analytics_id";
    DROP TABLE IF EXISTS "lesplan_analytics" CASCADE;
  `);
}
