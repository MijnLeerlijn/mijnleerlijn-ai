import type { Payload } from "payload";
import type { SearchHit, KnowledgeSourcePriority, BronRol } from "@/lib/embeddings/similarity-search";
import { richTextNaarPlatteTekst } from "@/lib/embeddings/embeddable-text";

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
  /** Alleen gezet voor type "handleiding-step" — de stabiele stap-id, zie SearchHit.stepId. */
  stepId?: string;
  text: string;
  similarity: number;
  refCollection: "knowledge-sources" | "knowledge-drafts" | "articles" | "handleidingen";
  refId: number;
  url: string;
  priority?: KnowledgeSourcePriority;
  bronrol?: BronRol;
}

const BRONROL_LABEL: Record<BronRol, string> = {
  "release-note": "release note",
  handleidingstap: "handleidingstap",
  manual: "handleiding",
  "background-model": "achtergrondmodel",
  faq: "FAQ",
  support: "support (niet definitief)",
};

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
  const handleidingIds = [
    ...new Set(
      hits.filter((h) => h.type === "handleiding" || h.type === "handleiding-step").map((h) => h.id)
    ),
  ];

  const [bronnen, drafts, articles, handleidingen] = await Promise.all([
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
    handleidingIds.length > 0
      ? payload.find({
          collection: "handleidingen",
          where: { id: { in: handleidingIds } },
          limit: handleidingIds.length,
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
          priority: hit.priority,
          bronrol: hit.bronrol,
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
          priority: hit.priority,
          bronrol: hit.bronrol,
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
        bronrol: hit.bronrol,
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
        bronrol: hit.bronrol,
      });
    } else if (hit.type === "handleiding" || hit.type === "handleiding-step") {
      const handleiding = handleidingen.docs.find((d) => d.id === hit.id);
      if (!handleiding) continue;
      if (hit.type === "handleiding-step") {
        // Stabiele id-lookup (NIET titel-matching, zie het commentaar bij
        // SearchHit.stepId) — een hernoemde stap breekt deze koppeling dus
        // nooit, in tegenstelling tot KnowledgeSources.chapters hierboven.
        const stap = ((handleiding.stappen ?? []) as { id?: string; titel: string; uitleg: unknown }[]).find(
          (s) => s.id === hit.stepId
        );
        if (!stap) continue;
        items.push({
          index: index++,
          type: hit.type,
          label: "Handleidingstap",
          title: handleiding.titel,
          chapterTitle: stap.titel,
          stepId: hit.stepId,
          text: `${stap.titel}\n${richTextNaarPlatteTekst(stap.uitleg)}`,
          similarity: hit.similarity,
          refCollection: "handleidingen",
          refId: handleiding.id,
          url: `/handleidingen/${handleiding.slug}#stap-${hit.stepId}`,
          bronrol: hit.bronrol,
        });
      } else {
        items.push({
          index: index++,
          type: hit.type,
          label: "Handleiding",
          title: handleiding.titel,
          text: handleiding.korteOmschrijving ?? "",
          similarity: hit.similarity,
          refCollection: "handleidingen",
          refId: handleiding.id,
          url: `/handleidingen/${handleiding.slug}`,
          bronrol: hit.bronrol,
        });
      }
    }
  }

  return items;
}

/**
 * De bronrol (en, indien van toepassing, de prioriteit) staat expliciet in
 * de header van elk contextblok — zodat het taalmodel zelf de
 * conflictregels uit de systeeminstructie (lib/assistant/answer.ts) kan
 * toepassen: "welke bron(nen) zijn hier het meest gezaghebbend voor DEZE
 * vraag" is een contextafhankelijke afweging (zie het commentaar bij
 * BronRol in lib/embeddings/similarity-search.ts) die het model met deze
 * expliciete labels kan maken, niet iets dat hier als vaste sorteervolgorde
 * afgedwongen kan worden.
 */
export function contextItemsNaarPrompt(items: ContextItem[]): string {
  return items
    .map((item) => {
      const rolLabel = item.bronrol ? BRONROL_LABEL[item.bronrol] : undefined;
      const metadata = [rolLabel, item.priority].filter(Boolean).join(", ");
      return `[Bron ${item.index}: ${item.label} "${item.title}"${item.chapterTitle ? ` — ${item.chapterTitle}` : ""}${metadata ? ` (${metadata})` : ""}]\n${item.text}`;
    })
    .join("\n\n");
}

/**
 * Kennisbasis MijnLeerlijn — Fase 4: het centrale-kennisbasisblok is bewust
 * GEEN ContextItem en verschijnt dus nooit in `items`/`contextItemsNaarPrompt`
 * hierboven — dat zou het ook laten meetellen in answer.ts's confidence-
 * gate (gebaseerd op `contextItems[0]?.similarity`), terwijl dit blok altijd
 * gegarandeerd aanwezig moet zijn, los van elke similarity-score. Aparte,
 * duidelijk gelabelde tekst die vóór de genummerde bronblokken in de prompt
 * komt te staan — zie answer.ts.
 */
export function kennisbasisBlokNaarPrompt(kennisbasis: { tekst: string; versie: string }): string {
  return `[Centrale Kennisbasis MijnLeerlijn — achtergrondcontext voor visie, betekenis, samenhang en productlogica (versie ${kennisbasis.versie})]\n${kennisbasis.tekst}`;
}
