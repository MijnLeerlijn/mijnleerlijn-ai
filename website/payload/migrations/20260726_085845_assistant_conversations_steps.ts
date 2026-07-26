import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "assistant_conversations_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"handleiding_id" numeric NOT NULL,
  	"step_id" varchar NOT NULL,
  	"step_nummer" numeric NOT NULL
  );
  
  ALTER TABLE "assistant_conversations_steps" ADD CONSTRAINT "assistant_conversations_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "assistant_conversations_steps_order_idx" ON "assistant_conversations_steps" USING btree ("_order");
  CREATE INDEX "assistant_conversations_steps_parent_id_idx" ON "assistant_conversations_steps" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "assistant_conversations_steps" CASCADE;`)
}
