import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "gmail_connection" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email_address" varchar,
  	"encrypted_access_token" varchar,
  	"encrypted_refresh_token" varchar,
  	"token_expires_at" timestamp(3) with time zone,
  	"connected_at" timestamp(3) with time zone,
  	"last_sync_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "gmail_connection_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "gmail_connection_texts" ADD CONSTRAINT "gmail_connection_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gmail_connection"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "gmail_connection_texts_order_parent" ON "gmail_connection_texts" USING btree ("order","parent_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "gmail_connection" CASCADE;
  DROP TABLE "gmail_connection_texts" CASCADE;`);
}
