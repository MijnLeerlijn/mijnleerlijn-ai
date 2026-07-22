import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'editor');
  CREATE TYPE "public"."enum_variants_status" AS ENUM('concept', 'actief', 'gearchiveerd');
  CREATE TYPE "public"."enum_variants_domain_type" AS ENUM('custom_domain', 'subdomain', 'slug_path');
  CREATE TYPE "public"."enum_variants_domain_domain_status" AS ENUM('slug_path', 'subdomain', 'custom_domain');
  CREATE TYPE "public"."enum_categories_color" AS ENUM('blauw', 'groen', 'oranje', 'geel', 'rood');
  CREATE TYPE "public"."enum_articles_knowledge_type" AS ENUM('product', 'pedagogisch');
  CREATE TYPE "public"."enum_articles_article_status" AS ENUM('concept', 'in_review', 'gepland', 'gepubliceerd', 'gearchiveerd');
  CREATE TYPE "public"."enum_articles_ai_approval_status" AS ENUM('n.v.t.', 'in_afwachting', 'goedgekeurd');
  CREATE TYPE "public"."enum_articles_embedding_status" AS ENUM('pending', 'indexed', 'stale');
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_knowledge_type" AS ENUM('product', 'pedagogisch');
  CREATE TYPE "public"."enum__articles_v_version_article_status" AS ENUM('concept', 'in_review', 'gepland', 'gepubliceerd', 'gearchiveerd');
  CREATE TYPE "public"."enum__articles_v_version_ai_approval_status" AS ENUM('n.v.t.', 'in_afwachting', 'goedgekeurd');
  CREATE TYPE "public"."enum__articles_v_version_embedding_status" AS ENUM('pending', 'indexed', 'stale');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_variant_overrides_target_type" AS ENUM('article', 'section', 'block');
  CREATE TYPE "public"."enum_variant_overrides_action" AS ENUM('onveranderd', 'aanvullen', 'vervangen', 'verbergen', 'ander_medium', 'invoegen_voor', 'invoegen_na');
  CREATE TYPE "public"."enum_variant_overrides_status" AS ENUM('concept', 'gepubliceerd');
  CREATE TYPE "public"."enum_sources_type" AS ENUM('interne_handleiding', 'externe_link', 'document', 'onderzoek', 'overig');
  CREATE TYPE "public"."enum_sources_reliability" AS ENUM('hoog', 'gemiddeld', 'laag');
  CREATE TYPE "public"."enum_sources_internal_status" AS ENUM('concept', 'goedgekeurd', 'verouderd');
  CREATE TYPE "public"."enum_media_media_type" AS ENUM('afbeelding', 'video', 'download');
  CREATE TYPE "public"."enum_updates_badge" AS ENUM('Nieuw', 'Bijgewerkt');
  CREATE TYPE "public"."enum_contact_submissions_status" AS ENUM('nieuw', 'in_behandeling', 'afgehandeld');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" "enum_users_role" DEFAULT 'editor' NOT NULL,
  	"variant_scope_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "variants_terminology_dictionary" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"central_term" varchar NOT NULL,
  	"variant_term" varchar NOT NULL
  );
  
  CREATE TABLE "variants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"status" "enum_variants_status" DEFAULT 'concept' NOT NULL,
  	"education_type" varchar NOT NULL,
  	"domain_type" "enum_variants_domain_type" DEFAULT 'slug_path' NOT NULL,
  	"domain_value" varchar NOT NULL,
  	"domain_domain_status" "enum_variants_domain_domain_status" DEFAULT 'slug_path' NOT NULL,
  	"branding_logo_id" integer,
  	"branding_accent_color" varchar DEFAULT '#1588c9' NOT NULL,
  	"branding_product_name" varchar NOT NULL,
  	"branding_tagline" varchar NOT NULL,
  	"branding_is_placeholder" boolean DEFAULT true,
  	"contact_email" varchar,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"icon" varchar NOT NULL,
  	"color" "enum_categories_color" NOT NULL,
  	"description" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "articles_blocks_tekst" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "articles_blocks_genummerde_stap" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "articles_blocks_afbeelding" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"caption" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "articles_blocks_waarschuwing" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "articles_blocks_tip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "articles_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"caption" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "articles_blocks_download" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"label" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "articles_blocks_contact_doorverwijzing" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" varchar,
  	"prefilled_subject" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "articles_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"summary" varchar,
  	"category_id" integer,
  	"knowledge_type" "enum_articles_knowledge_type" DEFAULT 'product',
  	"article_status" "enum_articles_article_status" DEFAULT 'concept',
  	"ai_approval_status" "enum_articles_ai_approval_status" DEFAULT 'n.v.t.',
  	"embedding_status" "enum_articles_embedding_status" DEFAULT 'pending',
  	"published_at" timestamp(3) with time zone,
  	"last_content_update" timestamp(3) with time zone,
  	"author_id" integer,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "articles_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variants_id" integer,
  	"sources_id" integer,
  	"articles_id" integer
  );
  
  CREATE TABLE "_articles_v_blocks_tekst" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_genummerde_stap" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"body" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_afbeelding" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"caption" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_waarschuwing" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"body" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_tip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"body" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"caption" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_download" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"label" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_contact_doorverwijzing" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"body" varchar,
  	"prefilled_subject" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_version_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_summary" varchar,
  	"version_category_id" integer,
  	"version_knowledge_type" "enum__articles_v_version_knowledge_type" DEFAULT 'product',
  	"version_article_status" "enum__articles_v_version_article_status" DEFAULT 'concept',
  	"version_ai_approval_status" "enum__articles_v_version_ai_approval_status" DEFAULT 'n.v.t.',
  	"version_embedding_status" "enum__articles_v_version_embedding_status" DEFAULT 'pending',
  	"version_published_at" timestamp(3) with time zone,
  	"version_last_content_update" timestamp(3) with time zone,
  	"version_author_id" integer,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_articles_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variants_id" integer,
  	"sources_id" integer,
  	"articles_id" integer
  );
  
  CREATE TABLE "variant_overrides" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant_id" integer NOT NULL,
  	"target_article_id" integer NOT NULL,
  	"target_type" "enum_variant_overrides_target_type" NOT NULL,
  	"target_id" varchar NOT NULL,
  	"action" "enum_variant_overrides_action" NOT NULL,
  	"payload" jsonb,
  	"term_overrides_applied" boolean DEFAULT true,
  	"status" "enum_variant_overrides_status" DEFAULT 'concept' NOT NULL,
  	"edited_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"type" "enum_sources_type" DEFAULT 'interne_handleiding' NOT NULL,
  	"url" varchar,
  	"file_id" integer,
  	"publisher" varchar,
  	"published_date" timestamp(3) with time zone,
  	"reliability" "enum_sources_reliability" DEFAULT 'gemiddeld' NOT NULL,
  	"usage_rights" varchar,
  	"internal_status" "enum_sources_internal_status" DEFAULT 'concept' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sources_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variants_id" integer
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt_text" varchar NOT NULL,
  	"media_type" "enum_media_media_type" DEFAULT 'afbeelding' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar
  );
  
  CREATE TABLE "updates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"article_id" integer NOT NULL,
  	"badge" "enum_updates_badge" DEFAULT 'Bijgewerkt' NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "contact_submissions_attachments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"storage_key" varchar NOT NULL,
  	"filename" varchar NOT NULL,
  	"mime_type" varchar NOT NULL,
  	"size_bytes" numeric NOT NULL,
  	"uploaded_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "contact_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"teacher_name" varchar NOT NULL,
  	"school_name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"request_type" varchar NOT NULL,
  	"subject" varchar NOT NULL,
  	"problem_description" varchar NOT NULL,
  	"expected" varchar,
  	"actual" varchar,
  	"page_url" varchar,
  	"variant_id" integer,
  	"help_center_url" varchar,
  	"submitted_at" timestamp(3) with time zone NOT NULL,
  	"device_info" varchar,
  	"status" "enum_contact_submissions_status" DEFAULT 'nieuw' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"variants_id" integer,
  	"categories_id" integer,
  	"articles_id" integer,
  	"variant_overrides_id" integer,
  	"sources_id" integer,
  	"media_id" integer,
  	"updates_id" integer,
  	"contact_submissions_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_variant_scope_id_variants_id_fk" FOREIGN KEY ("variant_scope_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "variants_terminology_dictionary" ADD CONSTRAINT "variants_terminology_dictionary_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "variants" ADD CONSTRAINT "variants_branding_logo_id_media_id_fk" FOREIGN KEY ("branding_logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "variants" ADD CONSTRAINT "variants_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_blocks_tekst" ADD CONSTRAINT "articles_blocks_tekst_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_blocks_genummerde_stap" ADD CONSTRAINT "articles_blocks_genummerde_stap_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_blocks_afbeelding" ADD CONSTRAINT "articles_blocks_afbeelding_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_blocks_afbeelding" ADD CONSTRAINT "articles_blocks_afbeelding_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_blocks_waarschuwing" ADD CONSTRAINT "articles_blocks_waarschuwing_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_blocks_tip" ADD CONSTRAINT "articles_blocks_tip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_blocks_video" ADD CONSTRAINT "articles_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_blocks_download" ADD CONSTRAINT "articles_blocks_download_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_blocks_download" ADD CONSTRAINT "articles_blocks_download_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_blocks_contact_doorverwijzing" ADD CONSTRAINT "articles_blocks_contact_doorverwijzing_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_sections" ADD CONSTRAINT "articles_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_texts" ADD CONSTRAINT "articles_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_tekst" ADD CONSTRAINT "_articles_v_blocks_tekst_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_genummerde_stap" ADD CONSTRAINT "_articles_v_blocks_genummerde_stap_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_afbeelding" ADD CONSTRAINT "_articles_v_blocks_afbeelding_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_afbeelding" ADD CONSTRAINT "_articles_v_blocks_afbeelding_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_waarschuwing" ADD CONSTRAINT "_articles_v_blocks_waarschuwing_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_tip" ADD CONSTRAINT "_articles_v_blocks_tip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_video" ADD CONSTRAINT "_articles_v_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_download" ADD CONSTRAINT "_articles_v_blocks_download_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_download" ADD CONSTRAINT "_articles_v_blocks_download_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_contact_doorverwijzing" ADD CONSTRAINT "_articles_v_blocks_contact_doorverwijzing_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_sections" ADD CONSTRAINT "_articles_v_version_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_category_id_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_texts" ADD CONSTRAINT "_articles_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "variant_overrides" ADD CONSTRAINT "variant_overrides_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "variant_overrides" ADD CONSTRAINT "variant_overrides_target_article_id_articles_id_fk" FOREIGN KEY ("target_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "variant_overrides" ADD CONSTRAINT "variant_overrides_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources_rels" ADD CONSTRAINT "sources_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sources_rels" ADD CONSTRAINT "sources_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "updates" ADD CONSTRAINT "updates_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_submissions_attachments" ADD CONSTRAINT "contact_submissions_attachments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."contact_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variant_overrides_fk" FOREIGN KEY ("variant_overrides_id") REFERENCES "public"."variant_overrides"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_updates_fk" FOREIGN KEY ("updates_id") REFERENCES "public"."updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contact_submissions_fk" FOREIGN KEY ("contact_submissions_id") REFERENCES "public"."contact_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_variant_scope_idx" ON "users" USING btree ("variant_scope_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "variants_terminology_dictionary_order_idx" ON "variants_terminology_dictionary" USING btree ("_order");
  CREATE INDEX "variants_terminology_dictionary_parent_id_idx" ON "variants_terminology_dictionary" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "variants_slug_idx" ON "variants" USING btree ("slug");
  CREATE INDEX "variants_branding_branding_logo_idx" ON "variants" USING btree ("branding_logo_id");
  CREATE INDEX "variants_created_by_idx" ON "variants" USING btree ("created_by_id");
  CREATE INDEX "variants_updated_at_idx" ON "variants" USING btree ("updated_at");
  CREATE INDEX "variants_created_at_idx" ON "variants" USING btree ("created_at");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE INDEX "articles_blocks_tekst_order_idx" ON "articles_blocks_tekst" USING btree ("_order");
  CREATE INDEX "articles_blocks_tekst_parent_id_idx" ON "articles_blocks_tekst" USING btree ("_parent_id");
  CREATE INDEX "articles_blocks_tekst_path_idx" ON "articles_blocks_tekst" USING btree ("_path");
  CREATE INDEX "articles_blocks_genummerde_stap_order_idx" ON "articles_blocks_genummerde_stap" USING btree ("_order");
  CREATE INDEX "articles_blocks_genummerde_stap_parent_id_idx" ON "articles_blocks_genummerde_stap" USING btree ("_parent_id");
  CREATE INDEX "articles_blocks_genummerde_stap_path_idx" ON "articles_blocks_genummerde_stap" USING btree ("_path");
  CREATE INDEX "articles_blocks_afbeelding_order_idx" ON "articles_blocks_afbeelding" USING btree ("_order");
  CREATE INDEX "articles_blocks_afbeelding_parent_id_idx" ON "articles_blocks_afbeelding" USING btree ("_parent_id");
  CREATE INDEX "articles_blocks_afbeelding_path_idx" ON "articles_blocks_afbeelding" USING btree ("_path");
  CREATE INDEX "articles_blocks_afbeelding_media_idx" ON "articles_blocks_afbeelding" USING btree ("media_id");
  CREATE INDEX "articles_blocks_waarschuwing_order_idx" ON "articles_blocks_waarschuwing" USING btree ("_order");
  CREATE INDEX "articles_blocks_waarschuwing_parent_id_idx" ON "articles_blocks_waarschuwing" USING btree ("_parent_id");
  CREATE INDEX "articles_blocks_waarschuwing_path_idx" ON "articles_blocks_waarschuwing" USING btree ("_path");
  CREATE INDEX "articles_blocks_tip_order_idx" ON "articles_blocks_tip" USING btree ("_order");
  CREATE INDEX "articles_blocks_tip_parent_id_idx" ON "articles_blocks_tip" USING btree ("_parent_id");
  CREATE INDEX "articles_blocks_tip_path_idx" ON "articles_blocks_tip" USING btree ("_path");
  CREATE INDEX "articles_blocks_video_order_idx" ON "articles_blocks_video" USING btree ("_order");
  CREATE INDEX "articles_blocks_video_parent_id_idx" ON "articles_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "articles_blocks_video_path_idx" ON "articles_blocks_video" USING btree ("_path");
  CREATE INDEX "articles_blocks_download_order_idx" ON "articles_blocks_download" USING btree ("_order");
  CREATE INDEX "articles_blocks_download_parent_id_idx" ON "articles_blocks_download" USING btree ("_parent_id");
  CREATE INDEX "articles_blocks_download_path_idx" ON "articles_blocks_download" USING btree ("_path");
  CREATE INDEX "articles_blocks_download_media_idx" ON "articles_blocks_download" USING btree ("media_id");
  CREATE INDEX "articles_blocks_contact_doorverwijzing_order_idx" ON "articles_blocks_contact_doorverwijzing" USING btree ("_order");
  CREATE INDEX "articles_blocks_contact_doorverwijzing_parent_id_idx" ON "articles_blocks_contact_doorverwijzing" USING btree ("_parent_id");
  CREATE INDEX "articles_blocks_contact_doorverwijzing_path_idx" ON "articles_blocks_contact_doorverwijzing" USING btree ("_path");
  CREATE INDEX "articles_sections_order_idx" ON "articles_sections" USING btree ("_order");
  CREATE INDEX "articles_sections_parent_id_idx" ON "articles_sections" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category_id");
  CREATE INDEX "articles_author_idx" ON "articles" USING btree ("author_id");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");
  CREATE INDEX "articles_texts_order_parent" ON "articles_texts" USING btree ("order","parent_id");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_variants_id_idx" ON "articles_rels" USING btree ("variants_id");
  CREATE INDEX "articles_rels_sources_id_idx" ON "articles_rels" USING btree ("sources_id");
  CREATE INDEX "articles_rels_articles_id_idx" ON "articles_rels" USING btree ("articles_id");
  CREATE INDEX "_articles_v_blocks_tekst_order_idx" ON "_articles_v_blocks_tekst" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_tekst_parent_id_idx" ON "_articles_v_blocks_tekst" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_tekst_path_idx" ON "_articles_v_blocks_tekst" USING btree ("_path");
  CREATE INDEX "_articles_v_blocks_genummerde_stap_order_idx" ON "_articles_v_blocks_genummerde_stap" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_genummerde_stap_parent_id_idx" ON "_articles_v_blocks_genummerde_stap" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_genummerde_stap_path_idx" ON "_articles_v_blocks_genummerde_stap" USING btree ("_path");
  CREATE INDEX "_articles_v_blocks_afbeelding_order_idx" ON "_articles_v_blocks_afbeelding" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_afbeelding_parent_id_idx" ON "_articles_v_blocks_afbeelding" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_afbeelding_path_idx" ON "_articles_v_blocks_afbeelding" USING btree ("_path");
  CREATE INDEX "_articles_v_blocks_afbeelding_media_idx" ON "_articles_v_blocks_afbeelding" USING btree ("media_id");
  CREATE INDEX "_articles_v_blocks_waarschuwing_order_idx" ON "_articles_v_blocks_waarschuwing" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_waarschuwing_parent_id_idx" ON "_articles_v_blocks_waarschuwing" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_waarschuwing_path_idx" ON "_articles_v_blocks_waarschuwing" USING btree ("_path");
  CREATE INDEX "_articles_v_blocks_tip_order_idx" ON "_articles_v_blocks_tip" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_tip_parent_id_idx" ON "_articles_v_blocks_tip" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_tip_path_idx" ON "_articles_v_blocks_tip" USING btree ("_path");
  CREATE INDEX "_articles_v_blocks_video_order_idx" ON "_articles_v_blocks_video" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_video_parent_id_idx" ON "_articles_v_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_video_path_idx" ON "_articles_v_blocks_video" USING btree ("_path");
  CREATE INDEX "_articles_v_blocks_download_order_idx" ON "_articles_v_blocks_download" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_download_parent_id_idx" ON "_articles_v_blocks_download" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_download_path_idx" ON "_articles_v_blocks_download" USING btree ("_path");
  CREATE INDEX "_articles_v_blocks_download_media_idx" ON "_articles_v_blocks_download" USING btree ("media_id");
  CREATE INDEX "_articles_v_blocks_contact_doorverwijzing_order_idx" ON "_articles_v_blocks_contact_doorverwijzing" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_contact_doorverwijzing_parent_id_idx" ON "_articles_v_blocks_contact_doorverwijzing" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_contact_doorverwijzing_path_idx" ON "_articles_v_blocks_contact_doorverwijzing" USING btree ("_path");
  CREATE INDEX "_articles_v_version_sections_order_idx" ON "_articles_v_version_sections" USING btree ("_order");
  CREATE INDEX "_articles_v_version_sections_parent_id_idx" ON "_articles_v_version_sections" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v" USING btree ("version_slug");
  CREATE INDEX "_articles_v_version_version_category_idx" ON "_articles_v" USING btree ("version_category_id");
  CREATE INDEX "_articles_v_version_version_author_idx" ON "_articles_v" USING btree ("version_author_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "_articles_v_autosave_idx" ON "_articles_v" USING btree ("autosave");
  CREATE INDEX "_articles_v_texts_order_parent" ON "_articles_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_articles_v_rels_order_idx" ON "_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_variants_id_idx" ON "_articles_v_rels" USING btree ("variants_id");
  CREATE INDEX "_articles_v_rels_sources_id_idx" ON "_articles_v_rels" USING btree ("sources_id");
  CREATE INDEX "_articles_v_rels_articles_id_idx" ON "_articles_v_rels" USING btree ("articles_id");
  CREATE INDEX "variant_overrides_variant_idx" ON "variant_overrides" USING btree ("variant_id");
  CREATE INDEX "variant_overrides_target_article_idx" ON "variant_overrides" USING btree ("target_article_id");
  CREATE INDEX "variant_overrides_edited_by_idx" ON "variant_overrides" USING btree ("edited_by_id");
  CREATE INDEX "variant_overrides_updated_at_idx" ON "variant_overrides" USING btree ("updated_at");
  CREATE INDEX "variant_overrides_created_at_idx" ON "variant_overrides" USING btree ("created_at");
  CREATE INDEX "sources_file_idx" ON "sources" USING btree ("file_id");
  CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
  CREATE INDEX "sources_rels_order_idx" ON "sources_rels" USING btree ("order");
  CREATE INDEX "sources_rels_parent_idx" ON "sources_rels" USING btree ("parent_id");
  CREATE INDEX "sources_rels_path_idx" ON "sources_rels" USING btree ("path");
  CREATE INDEX "sources_rels_variants_id_idx" ON "sources_rels" USING btree ("variants_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "updates_article_idx" ON "updates" USING btree ("article_id");
  CREATE INDEX "updates_updated_at_idx" ON "updates" USING btree ("updated_at");
  CREATE INDEX "updates_created_at_idx" ON "updates" USING btree ("created_at");
  CREATE INDEX "contact_submissions_attachments_order_idx" ON "contact_submissions_attachments" USING btree ("_order");
  CREATE INDEX "contact_submissions_attachments_parent_id_idx" ON "contact_submissions_attachments" USING btree ("_parent_id");
  CREATE INDEX "contact_submissions_variant_idx" ON "contact_submissions" USING btree ("variant_id");
  CREATE INDEX "contact_submissions_updated_at_idx" ON "contact_submissions" USING btree ("updated_at");
  CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("variants_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_variant_overrides_id_idx" ON "payload_locked_documents_rels" USING btree ("variant_overrides_id");
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("sources_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_updates_id_idx" ON "payload_locked_documents_rels" USING btree ("updates_id");
  CREATE INDEX "payload_locked_documents_rels_contact_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("contact_submissions_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "variants_terminology_dictionary" CASCADE;
  DROP TABLE "variants" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "articles_blocks_tekst" CASCADE;
  DROP TABLE "articles_blocks_genummerde_stap" CASCADE;
  DROP TABLE "articles_blocks_afbeelding" CASCADE;
  DROP TABLE "articles_blocks_waarschuwing" CASCADE;
  DROP TABLE "articles_blocks_tip" CASCADE;
  DROP TABLE "articles_blocks_video" CASCADE;
  DROP TABLE "articles_blocks_download" CASCADE;
  DROP TABLE "articles_blocks_contact_doorverwijzing" CASCADE;
  DROP TABLE "articles_sections" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_texts" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "_articles_v_blocks_tekst" CASCADE;
  DROP TABLE "_articles_v_blocks_genummerde_stap" CASCADE;
  DROP TABLE "_articles_v_blocks_afbeelding" CASCADE;
  DROP TABLE "_articles_v_blocks_waarschuwing" CASCADE;
  DROP TABLE "_articles_v_blocks_tip" CASCADE;
  DROP TABLE "_articles_v_blocks_video" CASCADE;
  DROP TABLE "_articles_v_blocks_download" CASCADE;
  DROP TABLE "_articles_v_blocks_contact_doorverwijzing" CASCADE;
  DROP TABLE "_articles_v_version_sections" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_texts" CASCADE;
  DROP TABLE "_articles_v_rels" CASCADE;
  DROP TABLE "variant_overrides" CASCADE;
  DROP TABLE "sources" CASCADE;
  DROP TABLE "sources_rels" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "updates" CASCADE;
  DROP TABLE "contact_submissions_attachments" CASCADE;
  DROP TABLE "contact_submissions" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_variants_status";
  DROP TYPE "public"."enum_variants_domain_type";
  DROP TYPE "public"."enum_variants_domain_domain_status";
  DROP TYPE "public"."enum_categories_color";
  DROP TYPE "public"."enum_articles_knowledge_type";
  DROP TYPE "public"."enum_articles_article_status";
  DROP TYPE "public"."enum_articles_ai_approval_status";
  DROP TYPE "public"."enum_articles_embedding_status";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_knowledge_type";
  DROP TYPE "public"."enum__articles_v_version_article_status";
  DROP TYPE "public"."enum__articles_v_version_ai_approval_status";
  DROP TYPE "public"."enum__articles_v_version_embedding_status";
  DROP TYPE "public"."enum__articles_v_version_status";
  DROP TYPE "public"."enum_variant_overrides_target_type";
  DROP TYPE "public"."enum_variant_overrides_action";
  DROP TYPE "public"."enum_variant_overrides_status";
  DROP TYPE "public"."enum_sources_type";
  DROP TYPE "public"."enum_sources_reliability";
  DROP TYPE "public"."enum_sources_internal_status";
  DROP TYPE "public"."enum_media_media_type";
  DROP TYPE "public"."enum_updates_badge";
  DROP TYPE "public"."enum_contact_submissions_status";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`);
}
