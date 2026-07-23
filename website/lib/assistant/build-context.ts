import type { Payload } from "payload";
import type { SearchHit } from "@/lib/embeddings/similarity-search";

// Zet de treffers van lib/embeddings/similarity-search.ts om in
// contextblokken voor het taalmodel + weergavemetadata voor de
// bronvermelding in de UI. Haalt de volledige tekst per treffer op (de
// zoekfunctie geeft alleen titel/score terug, geen volledige inhoud) en
// bepaalt het label/type/URL voor de "Bronnen"-lijst.
//
// Labelkeuze (bewust, om nooit herleidbare brontekst te tonen): een
// knowledge-draft is altijd het resultaat van de PII-gescrubde Gmail-
// analyse (lib/support/analyze.ts) — de UI toont "Supportthread" als
// herkomstlabel, nooit de brontekst van de thread zelf. Een knowledge-source
// toont zijn eigen type (Handleiding/Video/Website/Release note/FAQ/Intern
// document). Een gepubliceerd artikel toont "Handleiding".

export interface ContextItem {
  index: number;
  type: SearchHit["type"];
  label: string;
  title: string;
  chapterTitle?: string;
  text: string;
  similarity: number;
  refCollection: "knowledge-sources" | "knowledge-drafts" | "articles";
  refId: number;
  url: string;
}

const BRON_TYPE_LABEL: Record<string, string> = {
  pdf: "Handleiding",
  handleiding: "Handleiding",
  video: "Video",
  website: "Website",
  release_notes: "Release note",
  faq: "FAQ",
  intern_document: "Intern document",
};

export async function buildContext(payload: Payload, hits: SearchHit[]): Promise<ContextItem[]> {
  const bronIds = hits
    .filter((h) => h.type === "knowledge-source" || h.type === "knowledge-source-chapter")
    .map((h) => h.id);
  const draftIds = hits.filter((h) => h.type === "knowledge-draft").map((h) => h.id);
  const articleIds = hits.filter((h) => h.type === "article").map((h) => h.id);

  const [bronnen, drafts, articles] = await Promise.all([
    bronIds.length > 0
      ? payload.find({
          collection: "knowledge-sources",
          where: { id: { in: bronIds } },
          limit: bronIds.length,
          overrideAccess: true,
          depth: 0,
        })
      : { docs: [] },
    draftIds.length > 0
      ? payload.find({
          collection: "knowledge-drafts",
          where: { id: { in: draftIds } },
          limit: draftIds.length,
          overrideAccess: true,
          depth: 0,
        })
      : { docs: [] },
    articleIds.length > 0
      ? payload.find({
          collection: "articles",
          where: { id: { in: articleIds } },
          limit: articleIds.length,
          overrideAccess: true,
          depth: 0,
        })
      : { docs: [] },
  ]);

  const items: ContextItem[] = [];
  let index = 1;

  for (const hit of hits) {
    if (hit.type === "knowledge-source" || hit.type === "knowledge-source-chapter") {
      const bron = bronnen.docs.find((d) => d.id === hit.id);
      if (!bron) continue;
      const label = BRON_TYPE_LABEL[bron.type] ?? "Kennisbron";
      if (hit.type === "knowledge-source-chapter") {
        const hoofdstuk = ((bron.chapters ?? []) as { title: string; summary: string }[]).find(
          (h) => h.title === hit.chapterTitle
        );
        if (!hoofdstuk) continue;
        items.push({
          index: index++,
          type: hit.type,
          label,
          title: bron.title,
          chapterTitle: hoofdstuk.title,
          text: hoofdstuk.summary,
          similarity: hit.similarity,
          refCollection: "knowledge-sources",
          refId: bron.id,
          url: `/admin/collections/knowledge-sources/${bron.id}`,
        });
      } else {
        items.push({
          index: index++,
          type: hit.type,
          label,
          title: bron.title,
          text: bron.aiSummary ?? "",
          similarity: hit.similarity,
          refCollection: "knowledge-sources",
          refId: bron.id,
          url: `/admin/collections/knowledge-sources/${bron.id}`,
        });
      }
    } else if (hit.type === "knowledge-draft") {
      const draft = drafts.docs.find((d) => d.id === hit.id);
      if (!draft) continue;
      items.push({
        index: index++,
        type: hit.type,
        label: "Supportthread",
        title: draft.title,
        text: [draft.shortAnswer, draft.fullAnswer].filter(Boolean).join("\n\n"),
        similarity: hit.similarity,
        refCollection: "knowledge-drafts",
        refId: draft.id,
        url: `/admin/collections/knowledge-drafts/${draft.id}`,
      });
    } else if (hit.type === "article") {
      const artikel = articles.docs.find((d) => d.id === hit.id);
      if (!artikel) continue;
      items.push({
        index: index++,
        type: hit.type,
        label: "Handleiding",
        title: artikel.title,
        text: artikel.summary ?? "",
        similarity: hit.similarity,
        refCollection: "articles",
        refId: artikel.id,
        url: `/artikel/${artikel.slug}`,
      });
    }
  }

  return items;
}

export function contextItemsNaarPrompt(items: ContextItem[]): string {
  return items
    .map(
      (item) =>
        `[Bron ${item.index}: ${item.label} "${item.title}"${item.chapterTitle ? ` — ${item.chapterTitle}` : ""}]\n${item.text}`
    )
    .join("\n\n");
}
