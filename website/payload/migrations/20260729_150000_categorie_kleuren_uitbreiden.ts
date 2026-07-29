import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Categorie-uiterlijk (2026-07-29): `enum_categories_color` bevatte tot nu
// toe 5 Nederlandse waarden (blauw/groen/oranje/geel/rood, zie
// 20260721_135820_initial.ts regel 9/89) — de beheerpagina Downloadcategorieën
// krijgt een visuele kleurenkiezer met 9 stabiele, Engelse waarden.
//
// RENAME VALUE i.p.v. een UPDATE-statement: dit is een zuivere naamswijziging
// op het ENUM-TYPE zelf, geen wijziging aan een kolomwaarde — elke bestaande
// rij in "categories" wijst na deze migratie automatisch naar dezelfde kleur
// onder de nieuwe naam. Geen enkele bestaande categorie verandert dus van
// uiterlijk op de live site.
//
// Postgres kan enum-waarden niet droppen (alleen toevoegen/hernoemen) — de
// down()-migratie zet de 5 oorspronkelijke namen terug, maar de 4 nieuw
// toegevoegde waarden (purple/teal/pink/slate) blijven als ongebruikte opties
// op het type staan. Dat is onschadelijk (geen kolom gebruikt ze na de
// terugdraai) en de enige mogelijke aanpak zonder het hele type te vervangen.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'blauw' TO 'blue';
  ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'groen' TO 'green';
  ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'oranje' TO 'orange';
  ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'geel' TO 'yellow';
  ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'rood' TO 'red';
  ALTER TYPE "public"."enum_categories_color" ADD VALUE 'purple';
  ALTER TYPE "public"."enum_categories_color" ADD VALUE 'teal';
  ALTER TYPE "public"."enum_categories_color" ADD VALUE 'pink';
  ALTER TYPE "public"."enum_categories_color" ADD VALUE 'slate';`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'blue' TO 'blauw';
  ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'green' TO 'groen';
  ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'orange' TO 'oranje';
  ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'yellow' TO 'geel';
  ALTER TYPE "public"."enum_categories_color" RENAME VALUE 'red' TO 'rood';`);
}
