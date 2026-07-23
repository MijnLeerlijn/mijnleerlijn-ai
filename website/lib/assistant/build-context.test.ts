import { describe, it, expect } from "vitest";
import { buildContext, contextItemsNaarPrompt } from "./build-context";
import { maakFakePayload } from "@/lib/support/fake-payload";
import type { SearchHit } from "@/lib/embeddings/similarity-search";

describe("buildContext", () => {
  it("haalt de volledige tekst en het juiste label op per brontype (meerdere bronnen)", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        { id: 1, title: "Handleiding profielen", type: "handleiding", aiSummary: "Uitleg over profielen." },
        { id: 2, title: "Video-uitleg", type: "video", aiSummary: "Video-samenvatting.", chapters: [] },
      ],
      "knowledge-drafts": [
        { id: 3, title: "Wachtwoord resetten", shortAnswer: "Kort.", fullAnswer: "Volledig antwoord." },
      ],
      articles: [
        { id: 4, title: "Rapportage exporteren", slug: "rapportage-exporteren", summary: "Exportuitleg." },
      ],
    });

    const hits: SearchHit[] = [
      { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.9, reason: "" },
      { type: "knowledge-draft", id: 3, title: "Wachtwoord resetten", similarity: 0.8, reason: "" },
      { type: "article", id: 4, title: "Rapportage exporteren", similarity: 0.7, reason: "" },
      { type: "knowledge-source", id: 2, title: "Video-uitleg", similarity: 0.6, reason: "" },
    ];

    const items = await buildContext(payload, hits);

    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      label: "Handleiding",
      title: "Handleiding profielen",
      text: "Uitleg over profielen.",
    });
    expect(items[1]).toMatchObject({ label: "Supportthread", title: "Wachtwoord resetten" });
    expect(items[1]!.text).toContain("Volledig antwoord.");
    expect(items[2]).toMatchObject({
      label: "Handleiding",
      title: "Rapportage exporteren",
      refCollection: "articles",
      url: "/artikel/rapportage-exporteren",
    });
    expect(items[3]).toMatchObject({ label: "Video", title: "Video-uitleg" });
  });

  it("vindt het juiste hoofdstuk terug voor een knowledge-source-chapter-treffer", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Grote handleiding",
          type: "pdf",
          aiSummary: "Algemene samenvatting.",
          chapters: [
            { title: "Hoofdstuk 1", summary: "Inleiding." },
            { title: "Hoofdstuk 2: Wachtwoord resetten", summary: "Ga naar instellingen." },
          ],
        },
      ],
    });

    const hits: SearchHit[] = [
      {
        type: "knowledge-source-chapter",
        id: 1,
        title: "Grote handleiding",
        chapterTitle: "Hoofdstuk 2: Wachtwoord resetten",
        similarity: 0.92,
        reason: "",
      },
    ];

    const items = await buildContext(payload, hits);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Grote handleiding",
      chapterTitle: "Hoofdstuk 2: Wachtwoord resetten",
      text: "Ga naar instellingen.",
    });
  });

  it("slaat een treffer over wanneer het brondocument niet meer bestaat, zonder te crashen", async () => {
    const { payload } = maakFakePayload({ "knowledge-drafts": [] });
    const hits: SearchHit[] = [
      { type: "knowledge-draft", id: 999, title: "Verwijderd concept", similarity: 0.9, reason: "" },
    ];

    const items = await buildContext(payload, hits);

    expect(items).toHaveLength(0);
  });

  it("geeft een lege lijst terug bij geen treffers (geen bronnen)", async () => {
    const { payload } = maakFakePayload({});
    const items = await buildContext(payload, []);
    expect(items).toHaveLength(0);
  });
});

describe("contextItemsNaarPrompt", () => {
  it("nummert bronnen op volgorde en toont het hoofdstuk indien aanwezig", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Bron A", type: "handleiding", aiSummary: "Tekst A." }],
    });
    const items = await buildContext(payload, [
      { type: "knowledge-source", id: 1, title: "Bron A", similarity: 0.9, reason: "" },
    ]);

    const prompt = contextItemsNaarPrompt(items);

    expect(prompt).toContain('[Bron 1: Handleiding "Bron A"]');
    expect(prompt).toContain("Tekst A.");
  });
});
