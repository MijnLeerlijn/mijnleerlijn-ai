import { getPayload, type Payload } from "payload";
import config from "../../payload.config";
import { categorieen } from "@/lib/data/categories";
import { varianten } from "@/lib/data/variants";
import { bronnen } from "@/lib/data/sources";
import { netBijgewerkt } from "@/lib/data/updates";
import { startenArtikelen } from "@/lib/data/articles/starten";
import { doelenPlanningArtikelen } from "@/lib/data/articles/doelen-planning";
import { leerlingenGroepenArtikelen } from "@/lib/data/articles/leerlingen-groepen";
import { vaardighedenArtikelen } from "@/lib/data/articles/vaardigheden";
import { documentenMediaArtikelen } from "@/lib/data/articles/documenten-media";
import { analyseRapportageArtikelen } from "@/lib/data/articles/analyse-rapportage";
import { notitiesArtikelen } from "@/lib/data/articles/notities";
import { beheerInstellingenArtikelen } from "@/lib/data/articles/beheer-instellingen";
import { actiesDownloadsArtikelen } from "@/lib/data/articles/acties-downloads";
import { onderwijsvariantenArtikelen } from "@/lib/data/articles/onderwijsvarianten";
import type { ArticleWithContent } from "@/lib/data/factory";
import type { ContentBlock } from "@/types/content";
import { plainTextToLexical } from "../lexical";

// Zaait de Fase 3-dummydata (lib/data/) als voorbeeldcontent in Payload —
// GEEN definitieve contentmigratie (die volgt in Fase 5 voor de 25 echte
// handleidingen, zie docs/IMPLEMENTATION-PLAN.md). Dit script is idempotent
// (upsert op slug) en uitsluitend bedoeld om een lege database te vullen
// zodat de applicatie zichtbaar en navigeerbaar is — zie Fase 4 Stap 7.
//
// Gebruik: npm run seed (vereist een geldige DATABASE_URI, zie .env.example).

const alleArtikelen: ArticleWithContent[] = [
  ...startenArtikelen,
  ...doelenPlanningArtikelen,
  ...leerlingenGroepenArtikelen,
  ...vaardighedenArtikelen,
  ...documentenMediaArtikelen,
  ...analyseRapportageArtikelen,
  ...notitiesArtikelen,
  ...beheerInstellingenArtikelen,
  ...actiesDownloadsArtikelen,
  ...onderwijsvariantenArtikelen,
];

// Kleinste geldige transparante PNG (1x1) — enige placeholder-afbeelding,
// gebruikt voor elk "afbeelding"/"download"-blok. Er bestaat geen echte
// beeldbank (Brand/images/ is leeg, zie docs/DESIGN-SYSTEM.md §Ontbreekt) —
// dit wordt expliciet als placeholder gelabeld, nooit stilzwijgend verzonnen.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

// Generieke upsert-helper over 3 verschillende collections — Payload's
// create/update-signatuur is per collection-slug strikt getypeerd (terecht,
// zie payload-generated.d.ts), maar een generieke `T` kan daar principieel
// nooit 1-op-1 tegen matchen. De daadwerkelijke veldvalidatie gebeurt gewoon
// door Payload zelf tijdens de aanroep (niet omzeild) — alleen de
// TypeScript-vorm van déze ene interne, niet-geëxporteerde helper wordt hier
// versoepeld. `draft: false` publiceert direct (i.p.v. Payload's eigen
// _status op "draft" te laten staan); de zichtbaarheid zelf loopt via het
// eigen `articleStatus`-veld, zie payload/collections/Articles.ts.
async function upsertBySlug<T extends Record<string, unknown>>(
  payload: Payload,
  collection: "variants" | "categories" | "articles",
  slug: string,
  data: T
): Promise<number> {
  const existing = await payload.find({ collection, where: { slug: { equals: slug } }, limit: 1, depth: 0 });
  if (existing.docs[0]) {
    const updated = await payload.update({
      collection,
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
      draft: false,
    } as Parameters<typeof payload.update>[0]);
    return Number(updated.id);
  }
  const created = await payload.create({
    collection,
    data: { ...data, slug },
    overrideAccess: true,
    draft: false,
  } as Parameters<typeof payload.create>[0]);
  return Number(created.id);
}

async function seedAdminUser(payload: Payload) {
  const email = process.env.SEED_ADMIN_EMAIL ?? "beheerder@mijnleerlijn.nl";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "wijzig-dit-wachtwoord";
  const existing = await payload.find({ collection: "users", where: { email: { equals: email } }, limit: 1 });
  if (existing.docs.length > 0) return;
  await payload.create({
    collection: "users",
    data: { email, password, name: "Beheerder", role: "admin" },
    overrideAccess: true,
  });
  console.log(
    `Admingebruiker aangemaakt: ${email} — wijzig het development-wachtwoord vóór productiegebruik.`
  );
}

async function seedPlaceholderMedia(payload: Payload): Promise<number> {
  const existing = await payload.find({
    collection: "media",
    where: { altText: { equals: "Placeholder — nog geen echte afbeelding beschikbaar" } },
    limit: 1,
  });
  if (existing.docs[0]) return Number(existing.docs[0].id);

  const created = await payload.create({
    collection: "media",
    data: { altText: "Placeholder — nog geen echte afbeelding beschikbaar", mediaType: "afbeelding" },
    file: {
      data: PLACEHOLDER_PNG,
      mimetype: "image/png",
      name: "placeholder.png",
      size: PLACEHOLDER_PNG.length,
    },
    overrideAccess: true,
  });
  return Number(created.id);
}

function blockToPayload(block: ContentBlock, placeholderMediaId: number): Record<string, unknown> {
  switch (block.type) {
    case "tekst":
      return { blockType: "tekst", body: plainTextToLexical(block.content.body) };
    case "genummerde_stap":
      return { blockType: "genummerde_stap", body: block.content.body };
    case "waarschuwing":
      return { blockType: "waarschuwing", body: block.content.body };
    case "tip":
      return { blockType: "tip", body: block.content.body };
    case "video":
      return { blockType: "video", url: block.content.url, caption: block.content.caption };
    case "contact_doorverwijzing":
      return {
        blockType: "contact_doorverwijzing",
        body: block.content.body,
        prefilledSubject: block.content.prefilledSubject,
      };
    case "afbeelding":
      return { blockType: "afbeelding", media: placeholderMediaId, caption: block.content.caption };
    case "download":
      return { blockType: "download", media: placeholderMediaId, label: block.content.label };
  }
}

async function run() {
  const payload = await getPayload({ config });
  console.log("Payload geïnitialiseerd, seed gestart…");

  await seedAdminUser(payload);
  const placeholderMediaId = await seedPlaceholderMedia(payload);

  // 1. Varianten
  const variantIdBySlug = new Map<string, number>();
  for (const v of varianten) {
    const id = await upsertBySlug(payload, "variants", v.slug, {
      name: v.name,
      status: v.status,
      educationType: v.educationType,
      domain: v.domain,
      branding: {
        accentColor: v.branding.accentColor,
        productName: v.branding.productName,
        tagline: v.branding.tagline,
        isPlaceholder: v.branding.isPlaceholder,
      },
      terminologyDictionary: v.terminologyDictionary,
      contactEmail: v.contactEmail,
    });
    variantIdBySlug.set(v.slug, id);
  }
  console.log(`${varianten.length} varianten gezaaid.`);

  // 2. Categorieën
  const categoryIdBySlug = new Map<string, number>();
  for (const c of categorieen) {
    const id = await upsertBySlug(payload, "categories", c.slug, {
      title: c.titel,
      icon: c.icoon,
      color: c.kleur,
      description: c.uitleg,
    });
    categoryIdBySlug.set(c.slug, id);
  }
  console.log(`${categorieen.length} categorieën gezaaid.`);

  // Fictieve Fase 3-demo-artikelen (+ bijbehorende bronnen/updates) zijn
  // handig voor lokale ontwikkeling/QA, maar horen niet thuis in een echte
  // productie-/preview-database naast de echte handleidingen (payload/
  // import-handleidingen/) — dat zou fictieve content laten doorgaan voor
  // echte MijnLeerlijn-documentatie. Standaard aan (ongewijzigd
  // dev-gedrag); expliciet uitzetten met SEED_INCLUDE_DEMO_ARTICLES=false
  // vóór een productie-/preview-seed.
  if (process.env.SEED_INCLUDE_DEMO_ARTICLES === "false") {
    console.log("SEED_INCLUDE_DEMO_ARTICLES=false — fictieve demo-artikelen/bronnen/updates overgeslagen.");
    console.log("Seed voltooid.");
    process.exit(0);
  }

  // 3. Bronnen (per artikelslug gegroepeerd, zodat artikelen ze kunnen koppelen)
  const sourceIdsByArticleSlug = new Map<string, number[]>();
  for (const b of bronnen) {
    const existing = await payload.find({
      collection: "sources",
      where: { title: { equals: b.titel } },
      limit: 1,
    });
    const id = existing.docs[0]
      ? Number(existing.docs[0].id)
      : Number(
          (
            await payload.create({
              collection: "sources",
              overrideAccess: true,
              data: {
                title: b.titel,
                type: "interne_handleiding",
                publisher: "MijnLeerlijn",
                publishedDate: b.datum,
                reliability: "hoog",
                internalStatus: "goedgekeurd",
              },
            })
          ).id
        );
    const lijst = sourceIdsByArticleSlug.get(b.artikelSlug) ?? [];
    lijst.push(id);
    sourceIdsByArticleSlug.set(b.artikelSlug, lijst);
  }
  console.log(`${bronnen.length} bronnen gezaaid.`);

  // 4. Artikelen
  const articleIdBySlug = new Map<string, number>();
  for (const artikel of alleArtikelen) {
    const categoryId = categoryIdBySlug.get(artikel.categorySlug);
    if (!categoryId) {
      console.warn(
        `Categorie "${artikel.categorySlug}" niet gevonden voor artikel "${artikel.slug}" — overgeslagen.`
      );
      continue;
    }
    const id = await upsertBySlug(payload, "articles", artikel.slug, {
      title: artikel.title,
      summary:
        artikel.sections[0]?.blocks.find((b) => b.type === "tekst")?.content.body ??
        artikel.sections[0]?.title ??
        artikel.title,
      category: categoryId,
      tags: artikel.tags,
      knowledgeType: artikel.knowledgeType,
      articleStatus: "gepubliceerd",
      aiApprovalStatus: artikel.knowledgeType === "pedagogisch" ? "goedgekeurd" : "n.v.t.",
      publishedAt: artikel.lastContentUpdate,
      lastContentUpdate: artikel.lastContentUpdate,
      sources: sourceIdsByArticleSlug.get(artikel.slug) ?? [],
      sections: artikel.sections.map((sectie) => ({
        title: sectie.title,
        blocks: sectie.blocks.map((b) => blockToPayload(b, placeholderMediaId)),
      })),
    });
    articleIdBySlug.set(artikel.slug, id);
  }
  console.log(`${alleArtikelen.length} artikelen gezaaid.`);

  // 5. Updates
  for (const update of netBijgewerkt) {
    const articleId = articleIdBySlug.get(update.artikelSlug);
    if (!articleId) continue;
    const existing = await payload.find({
      collection: "updates",
      where: { article: { equals: articleId } },
      limit: 1,
    });
    if (existing.docs[0]) continue;
    await payload.create({
      collection: "updates",
      overrideAccess: true,
      data: { article: articleId, badge: update.badge, date: update.datum },
    });
  }
  console.log(`${netBijgewerkt.length} updates gezaaid.`);

  console.log("Seed voltooid.");
  process.exit(0);
}

run().catch((error) => {
  console.error("Seed mislukt:", error);
  process.exit(1);
});
