import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Uitsluitend additief: maakt alleen de twee nieuwe gmail_connection*-tabellen
// aan (plus hun FK/index), raakt geen bestaande tabel/kolom aan — geen DROP,
// ALTER, RENAME, TRUNCATE of UPDATE/DELETE op iets dat al bestaat. Elke stap
// is bewust idempotent (IF NOT EXISTS / duplicate_object-guard) zodat een
// productiedatabase die ooit via Payload's dev-mode-push is bijgewerkt (en
// dus mogelijk al een deel van dit schema bevat) deze migratie veilig kan
// draaien zonder te falen op "already exists" — nooit door bestaande data
// heen te walsen.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "gmail_connection" (
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

  CREATE TABLE IF NOT EXISTS "gmail_connection_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );

  DO $$ BEGIN
   ALTER TABLE "gmail_connection_texts" ADD CONSTRAINT "gmail_connection_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gmail_connection"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "gmail_connection_texts_order_parent" ON "gmail_connection_texts" USING btree ("order","parent_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "gmail_connection" CASCADE;
  DROP TABLE IF EXISTS "gmail_connection_texts" CASCADE;`);
}
