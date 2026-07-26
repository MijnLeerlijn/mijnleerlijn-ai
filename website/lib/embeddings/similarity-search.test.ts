import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchKnowledge, searchKnowledgePhased } from "./similarity-search";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { generateEmbedding } from "@/services/ai-client";

vi.mock("@/services/ai-client", () => ({
  generateEmbedding: vi.fn(),
  getEmbeddingModelId: () => "text-embedding-3-small-test",
}));

const mockGenerateEmbedding = vi.mocked(generateEmbedding);

// We kunnen in tests geen echte OpenAI-embeddings aanroepen. In plaats
// daarvan geeft deze mock voor de ZOEKVRAAG een handgemaakte vector terug
// op basis van welk "onderwerp" erin voorkomt (met opzet ruim genoeg om
// vergelijkbare formuleringen, synoniemen én typo's te herkennen) — dit test
// de RANGSCHIKKINGS-/similarity-logica van onze eigen code (cosineSimilarity,
// sortering, drempel/redenopbouw), niet de daadwerkelijke semantische
// kwaliteit van OpenAI's model (dat is geen code die wij beheren). De
// OPGESLAGEN documentvectoren worden rechtstreeks als vaste testfixtures
// meegegeven, niet via deze mock.
function naarQueryVector(query: string): number[] {
  const q = query.toLowerCase();
  if (/wachtwoord|paswoord|wagtwoord|paswoerd|wachwoord/.test(q)) return [0.95, 0.05, 0];
  if (/factuur|rekening|betaling/.test(q)) return [0.05, 0.95, 0];
  return [0, 0, 1];
}

beforeEach(() => {
  mockGenerateEmbedding.mockReset();
  mockGenerateEmbedding.mockImplementation(async (query: string) => naarQueryVector(query));
});

describe("searchKnowledge — vergelijkbare formuleringen, synoniemen en typo's", () => {
  const seed = {
    "knowledge-drafts": [
      {
        id: 1,
        title: "Wachtwoord resetten",
        status: "approved",
        embeddingStatus: "indexed",
        embedding: [1, 0, 0],
      },
      {
        id: 2,
        title: "Factuur exporteren als PDF",
        status: "approved",
        embeddingStatus: "indexed",
        embedding: [0, 1, 0],
      },
    ],
  };

  it("vindt het juiste document bij de oorspronkelijke formulering", async () => {
    const { payload } = maakFakePayload(seed);
    const hits = await searchKnowledge(payload, { query: "Hoe reset ik mijn wachtwoord?" });
    expect(hits[0]).toMatchObject({ id: 1, title: "Wachtwoord resetten" });
    expect(hits[0]!.similarity).toBeGreaterThan(0.9);
  });

  it("vindt hetzelfde document bij een synoniem ('paswoord' i.p.v. 'wachtwoord')", async () => {
    const { payload } = maakFakePayload(seed);
    const hits = await searchKnowledge(payload, { query: "Ik ben mijn paswoord vergeten" });
    expect(hits[0]).toMatchObject({ id: 1, title: "Wachtwoord resetten" });
  });

  it("vindt hetzelfde document ondanks een typfout ('wagtwoord')", async () => {
    const { payload } = maakFakePayload(seed);
    const hits = await searchKnowledge(payload, { query: "wagtwoord opnieuw instellen" });
    expect(hits[0]).toMatchObject({ id: 1, title: "Wachtwoord resetten" });
  });

  it("rangschikt een ander document bovenaan bij een andere zoekvraag (factuur/rekening)", async () => {
    const { payload } = maakFakePayload(seed);
    const hits = await searchKnowledge(payload, { query: "Hoe betaal ik mijn rekening?" });
    expect(hits[0]).toMatchObject({ id: 2, title: "Factuur exporteren als PDF" });
  });
});

describe("searchKnowledge — dubbele documenten", () => {
  it("geeft beide bijna-identieke documenten terug, correct gerangschikt, zonder te crashen", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Wachtwoord resetten (handleiding)",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
        {
          id: 2,
          title: "Wachtwoord resetten (kopie)",
          embeddingStatus: "indexed",
          embedding: [0.99, 0.01, 0],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "Hoe reset ik mijn wachtwoord?" });

    expect(hits).toHaveLength(2);
    expect(hits[0]!.similarity).toBeGreaterThanOrEqual(hits[1]!.similarity);
    expect(hits.map((h) => h.id).sort()).toEqual([1, 2]);
  });
});

describe("searchKnowledge — hoofdstuk-niveau treffers", () => {
  it("geeft het specifieke hoofdstuk terug wanneer dat de beste match is, niet alleen de bron", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Grote handleiding",
          embeddingStatus: "indexed",
          embedding: [0, 0, 1], // de bron zelf gaat over iets anders
          chapters: [
            { title: "Hoofdstuk 3: Wachtwoord resetten", summary: "...", order: 3, embedding: [1, 0, 0] },
          ],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "Hoe reset ik mijn wachtwoord?" });

    expect(hits[0]).toMatchObject({
      type: "knowledge-source-chapter",
      id: 1,
      title: "Grote handleiding",
      chapterTitle: "Hoofdstuk 3: Wachtwoord resetten",
    });
    expect(hits[0]!.reason).toContain("Hoofdstuk 3: Wachtwoord resetten");
  });
});

describe("searchKnowledge — algemeen", () => {
  it("negeert documenten zonder embedding (nog niet geëmbed) en documenten met status anders dan 'indexed'", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        { id: 1, title: "Nog niet geëmbed", status: "approved", embeddingStatus: "pending" },
        { id: 2, title: "Verouderd", status: "approved", embeddingStatus: "stale", embedding: [1, 0, 0] },
        { id: 3, title: "Wel geëmbed", status: "approved", embeddingStatus: "indexed", embedding: [1, 0, 0] },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord" });

    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe(3);
  });

  it("respecteert de opgegeven limiet", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `Concept ${i + 1}`,
        status: "approved",
        embeddingStatus: "indexed",
        embedding: [1, 0, 0],
      })),
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord", limiet: 2 });

    expect(hits).toHaveLength(2);
  });
});

describe("searchKnowledge — Sprint 6: alleen goedgekeurde Knowledge Drafts", () => {
  it("gebruikt een 'approved' concept als bron, maar niet een 'new' (nog niet beoordeeld) of 'rejected' concept", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        {
          id: 1,
          title: "Nieuw, onbeoordeeld concept",
          status: "new",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
        {
          id: 2,
          title: "Afgekeurd concept",
          status: "rejected",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
        {
          id: 3,
          title: "Goedgekeurd concept",
          status: "approved",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord" });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 3, type: "knowledge-draft" });
  });

  it("gebruikt ook een 'published' concept niet (dat is al apart als artikel geëmbed)", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        {
          id: 1,
          title: "Al tot artikel verwerkt",
          status: "published",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord" });

    expect(hits).toHaveLength(0);
  });

  it("vindt na synchronisatie zowel een relevante handleiding (knowledge-source) als een bruikbare Knowledge Draft samen, correct gerangschikt", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Handleiding: wachtwoord resetten",
          type: "pdf",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
      ],
      "knowledge-drafts": [
        {
          id: 2,
          title: "Support-antwoord: wachtwoord vergeten",
          status: "approved",
          embeddingStatus: "indexed",
          embedding: [0.9, 0.1, 0],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord" });

    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.type).sort()).toEqual(["knowledge-draft", "knowledge-source"]);
    // De handleiding heeft de hogere similarity en staat dus vooraan.
    expect(hits[0]).toMatchObject({ type: "knowledge-source", id: 1 });
    expect(hits[1]).toMatchObject({ type: "knowledge-draft", id: 2 });
  });
});

describe("searchKnowledge — bronrol (purpose), chatbot-evaluatieopdracht", () => {
  it("leidt de bronrol af van `type` als `purpose` niet gezet is", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        { id: 1, title: "Een FAQ", type: "faq", embeddingStatus: "indexed", embedding: [1, 0, 0] },
      ],
    });
    const hits = await searchKnowledge(payload, { query: "wachtwoord" });
    expect(hits[0]).toMatchObject({ bronrol: "faq" });
  });

  it("gebruikt het expliciete `purpose`-veld als dat gezet is, ook als dat afwijkt van de type-default", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Achtergronddocument met FAQ-achtige inhoud",
          type: "intern_document",
          purpose: "faq",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
      ],
    });
    const hits = await searchKnowledge(payload, { query: "wachtwoord" });
    expect(hits[0]).toMatchObject({ bronrol: "faq" });
  });

  it("geeft een intern document zonder expliciete `purpose` de default bronrol 'background-model'", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Kennisbasis (achtergrondverhaal)",
          type: "intern_document",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
      ],
    });
    const hits = await searchKnowledge(payload, { query: "wachtwoord" });
    expect(hits[0]).toMatchObject({ bronrol: "background-model" });
  });

  it("geeft knowledge-drafts altijd bronrol 'support' (nooit definitieve waarheid)", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        { id: 1, title: "Concept", status: "approved", embeddingStatus: "indexed", embedding: [1, 0, 0] },
      ],
    });
    const hits = await searchKnowledge(payload, { query: "wachtwoord" });
    expect(hits[0]).toMatchObject({ bronrol: "support" });
  });

  it("geeft gepubliceerde artikelen altijd bronrol 'manual'", async () => {
    const { payload } = maakFakePayload({
      articles: [{ id: 1, title: "Artikel", embeddingStatus: "indexed", embedding: [1, 0, 0] }],
    });
    const hits = await searchKnowledge(payload, { query: "wachtwoord" });
    expect(hits[0]).toMatchObject({ bronrol: "manual" });
  });
});

describe("searchKnowledgePhased — gefaseerd zoeken op Knowledge Source-prioriteit", () => {
  const DREMPEL = 0.5; // exact MIN_SIMILARITY_VOOR_ANTWOORD uit lib/assistant/answer.ts, hier als letterlijk getal om geen cross-import (zie similarity-search.ts) nodig te hebben.

  // query = [1, 0, 0] (unit vector) — een kandidaat-embedding [x, sqrt(1-x²), 0]
  // (ook unit-lengte) geeft dan cosineSimilarity === x, exact. Zo kunnen scores
  // precies op de drempel/vergelijkbaarheid afgestemd worden zonder gokken.
  function embeddingVoorScore(score: number): number[] {
    return [score, Math.sqrt(1 - score * score), 0];
  }

  beforeEach(() => {
    mockGenerateEmbedding.mockResolvedValue([1, 0, 0]);
  });

  it("1. Voldoende goede core-resultaten: secondary en reference worden niet geselecteerd", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core A",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Core B",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
        {
          id: 3,
          title: "Secondary (hogere score dan beide core-resultaten)",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.95),
        },
        {
          id: 4,
          title: "Reference (hoogste score van allemaal)",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.99),
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 2,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core");
    expect(resultaat.hits.map((h) => h.id).sort()).toEqual([1, 2]);
    expect(resultaat.hits.some((h) => h.id === 3 || h.id === 4)).toBe(false);
    expect(resultaat.aantalVoldoendePerPrioriteit).toEqual({ core: 2, secondary: 1, reference: 1 });
  });

  it("2. Onvoldoende core-resultaten: secondary wordt toegevoegd, reference niet", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core (enige)",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Secondary A",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
        {
          id: 3,
          title: "Secondary B",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.7),
        },
        {
          id: 4,
          title: "Reference (zou ook meetellen als 'ie nodig was)",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.99),
        },
      ],
    });

    // limiet 3: core alleen (1 voldoende resultaat) is te weinig, core+secondary (1+2=3) is precies genoeg.
    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 3,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core+secondary");
    expect(resultaat.hits.map((h) => h.id).sort()).toEqual([1, 2, 3]);
    expect(resultaat.hits.some((h) => h.id === 4)).toBe(false);
  });

  it("3. Onvoldoende core én secondary: reference wordt toegevoegd", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core (enige)",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Secondary (enige)",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
        {
          id: 3,
          title: "Reference A",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.7),
        },
        {
          id: 4,
          title: "Reference B",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.6),
        },
      ],
    });

    // limiet 5: core (1) en core+secondary (2) zijn allebei te weinig, pas core+secondary+reference (4) is genoeg.
    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 5,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core+secondary+reference");
    expect(resultaat.hits.map((h) => h.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it("4. Vergelijkbare scores: core wint van secondary, secondary wint van reference", async () => {
    const gedeeldeScore = embeddingVoorScore(0.8); // exact dezelfde score voor alle drie
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Reference",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: gedeeldeScore,
        },
        { id: 2, title: "Core", priority: "core", embeddingStatus: "indexed", embedding: gedeeldeScore },
        {
          id: 3,
          title: "Secondary",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: gedeeldeScore,
        },
      ],
    });

    // limiet ruim hoger dan het totaal aantal kandidaten (3): dwingt volledige
    // escalatie af (core+secondary+reference), zodat alle drie meedoen en de
    // tie-break-sortering op prioriteit puur getest wordt, los van fasering.
    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core+secondary+reference");
    expect(resultaat.hits.map((h) => h.id)).toEqual([2, 3, 1]); // core (2) > secondary (3) > reference (1)
  });

  it("4b. Vergelijkbare scores, zelfde prioriteit: release note > handleiding > achtergrondmodel > FAQ > support (bronrol-tie-break)", async () => {
    const gedeeldeScore = embeddingVoorScore(0.8);
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "FAQ",
          type: "faq",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: gedeeldeScore,
        },
        {
          id: 2,
          title: "Release note",
          type: "release_notes",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: gedeeldeScore,
        },
        {
          id: 3,
          title: "Handleiding",
          type: "handleiding",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: gedeeldeScore,
        },
        {
          id: 4,
          title: "Achtergrondmodel",
          type: "intern_document",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: gedeeldeScore,
        },
      ],
      "knowledge-drafts": [
        { id: 5, title: "Support", status: "approved", embeddingStatus: "indexed", embedding: gedeeldeScore },
      ],
    });

    // limiet ruim hoger dan het totaal aantal kandidaten: dwingt volledige
    // escalatie af, zodat alle vijf meedoen en de bronrol-tie-break puur
    // getest wordt (alle vier Knowledge Sources hebben dezelfde prioriteit
    // "core", dus die tie-break heeft hier geen effect — precies bedoeld).
    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.hits.map((h) => h.id)).toEqual([2, 3, 4, 1, 5]);
  });

  it("5. Geen regressie: Articles en Knowledge Drafts blijven vindbaar, ongeacht de fasering op Knowledge Sources", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core A",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Core B",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
      ],
      "knowledge-drafts": [
        {
          id: 3,
          title: "Support-antwoord",
          status: "approved",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.6),
        },
      ],
      articles: [
        {
          id: 4,
          title: "Gepubliceerd artikel",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.55),
        },
      ],
    });

    // limiet 4 (= precies het totaal aantal kandidaten): niemand valt buiten
    // de uiteindelijke top-N door afkappen — dit test specifiek dat drafts/
    // articles nooit door de fase-logica zelf uit de kandidatenpool worden
    // gefilterd (ze horen niet bij een prioriteitstier en doen dus ALTIJD
    // mee, ongeacht welke fase op de knowledge-sources wordt gekozen).
    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 4,
      drempelVoorVoldoende: DREMPEL,
    });

    const idsInResultaat = resultaat.hits.map((h) => h.id);
    expect(idsInResultaat.sort()).toEqual([1, 2, 3, 4]);
    expect(resultaat.hits.find((h) => h.id === 3)).toMatchObject({ type: "knowledge-draft" });
    expect(resultaat.hits.find((h) => h.id === 4)).toMatchObject({ type: "article" });
  });

  it("negeert geen kandidaat en telt niets dubbel (deduplicatie): elke bron komt precies één keer voor", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Secondary",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.6),
        },
        {
          id: 3,
          title: "Reference",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.55),
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core+secondary+reference");
    const ids = resultaat.hits.map((h) => h.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });
});

// Livegang-afwerking: controle van de gewenste werking van het
// achtergrondverhaal ("Kennisbasis MijnLeerlijn — achtergrondverhaal voor de
// Helpdesk AI", purpose "background-model") t.o.v. handleidingen
// (bronrol "manual") — zie het gesprek. Live geverifieerd tegen de echte
// database (3 representatieve vragen, zie scratch-test-retrieval-
// achtergrond.ts, sindsdien verwijderd): het achtergrondverhaal komt puur
// via retrieval mee (geen forced-include), zit in dezelfde prioriteitstier
// (priority "core") als de meeste handleidingen, en verliest een tie-break
// bij gelijke score altijd van een handleiding (BRONROL_RANG in
// similarity-search.ts: manual=1 vóór background-model=2) — dat is precies
// "handleiding leidt bij concrete stappen, achtergrond bij visie/samenhang"
// uit lib/assistant/answer.ts's systeeminstructie. Geen codewijziging nodig
// gebleken; deze tests leggen het geverifieerde gedrag vast.
describe("searchKnowledgePhased — achtergrondverhaal (background-model) vs. handleidingen (manual)", () => {
  const DREMPEL = 0.5;

  function embeddingVoorScore(score: number): number[] {
    return [score, Math.sqrt(1 - score * score), 0];
  }

  beforeEach(() => {
    mockGenerateEmbedding.mockResolvedValue([1, 0, 0]);
  });

  it("1. Visie-/adviesvraag: het achtergrondverhaal scoort hoog en zit in de context", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 9,
          title: "Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI",
          type: "intern_document",
          purpose: "background-model",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.4), // bron zelf lager — het hoofdstuk hieronder is de echte match
          chapters: [
            {
              title: "1. De kernfilosofie: MijnLeerlijn is een middel, geen doel",
              embedding: embeddingVoorScore(0.9),
            },
          ],
        },
        {
          id: 21,
          title: "Handmatig leerdoelen toevoegen aan leerlingen",
          type: "pdf",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.3),
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "Wat is de visie van MijnLeerlijn op leerdoelgericht werken?",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    const top = resultaat.hits[0];
    expect(top?.id).toBe(9);
    expect(top?.bronrol).toBe("background-model");
  });

  it("2. Concrete knop-/stappenvraag: een handleiding staat bovenaan, het achtergrondverhaal levert nooit de stappen zelf", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 9,
          title: "Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI",
          type: "intern_document",
          purpose: "background-model",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.4),
          chapters: [
            { title: "4.3 Handmatig koppelen van losse doelen", embedding: embeddingVoorScore(0.75) },
          ],
        },
        {
          id: 21,
          title: "Handmatig leerdoelen toevoegen aan leerlingen",
          type: "pdf",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.82),
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "Hoe voeg ik handmatig een leerdoel toe aan een leerling?",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    const top = resultaat.hits[0];
    expect(top?.id).toBe(21);
    expect(top?.bronrol).toBe("manual");
    // Het achtergrondverhaal mag WEL meedoen als denkkader (score 75% haalt de drempel ruim),
    // maar staat niet bovenaan voor een pure stappenvraag.
    expect(resultaat.hits.some((h) => h.id === 9 && h.bronrol === "background-model")).toBe(true);
  });

  it("3. Gecombineerde vraag (achtergrond + handleiding beide nodig): allebei zitten in de context", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 9,
          title: "Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI",
          type: "intern_document",
          purpose: "background-model",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.4),
          chapters: [{ title: "2. De cyclus van MijnLeerlijn", embedding: embeddingVoorScore(0.78) }],
        },
        {
          id: 18,
          title: "Doelenset koppelen aan leerlingen",
          type: "pdf",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "Waarom werkt MijnLeerlijn met een doelencyclus en hoe koppel ik een doelenset aan een leerling?",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.hits.some((h) => h.id === 9 && h.bronrol === "background-model")).toBe(true);
    expect(resultaat.hits.some((h) => h.id === 18 && h.bronrol === "manual")).toBe(true);
  });

  it("4. Bij een (bijna) gelijke score wint de handleiding altijd de tie-break van het achtergrondverhaal", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 9,
          title: "Achtergrondverhaal",
          type: "intern_document",
          purpose: "background-model",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
        {
          id: 21,
          title: "Handleiding",
          type: "pdf",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8), // exact gelijke score
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 1, // slechts 1 plek: bij gelijke score beslist de tie-break wie 'm krijgt
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.hits).toHaveLength(1);
    expect(resultaat.hits[0]?.id).toBe(21);
    expect(resultaat.hits[0]?.bronrol).toBe("manual");
  });
});

// Handleidingbouwer: gestructureerde handleidingstappen als eigen kandidaat-
// bron naast Knowledge Sources/drafts/articles, zie het gesprek. Geen
// prioriteitstier (isAltijdToegelaten), harde status/verborgen-filters, en
// bronrol "handleidingstap" die bij gelijke score altijd wint van "manual"
// (PDF) maar verliest van "release-note".
describe("searchKnowledgePhased — Handleidingbouwer (handleidingen/handleidingstappen)", () => {
  const DREMPEL = 0.5;

  function embeddingVoorScore(score: number): number[] {
    return [score, Math.sqrt(1 - score * score), 0];
  }

  beforeEach(() => {
    mockGenerateEmbedding.mockResolvedValue([1, 0, 0]);
  });

  it("1. Een gepubliceerde handleiding en haar niet-verborgen stap komen mee als kandidaat, met stabiele stepId", async () => {
    const { payload } = maakFakePayload({
      handleidingen: [
        {
          id: 5,
          titel: "Hoofdgebiedprofiel aanmaken",
          korteOmschrijving: "Uitleg.",
          status: "gepubliceerd",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.4),
          stappen: [
            { id: "stap-abc", titel: "Open Beheer", embedding: embeddingVoorScore(0.9) },
            { id: "stap-def", titel: "Verborgen stap", verborgen: true, embedding: embeddingVoorScore(0.95) },
          ],
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    const stapHit = resultaat.hits.find((h) => h.type === "handleiding-step");
    expect(stapHit).toMatchObject({ id: 5, stepId: "stap-abc", chapterTitle: "Open Beheer", bronrol: "handleidingstap" });
    expect(resultaat.hits.some((h) => h.stepId === "stap-def")).toBe(false);
  });

  it("2. Een concept-handleiding komt NOOIT mee, ook niet met een hoge score", async () => {
    const { payload } = maakFakePayload({
      handleidingen: [
        {
          id: 6,
          titel: "Nog in concept",
          korteOmschrijving: "Uitleg.",
          status: "concept",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.99),
          stappen: [{ id: "s1", titel: "Stap", embedding: embeddingVoorScore(0.99) }],
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.hits.some((h) => h.id === 6)).toBe(false);
  });

  it("3. Een gearchiveerde handleiding komt NOOIT mee", async () => {
    const { payload } = maakFakePayload({
      handleidingen: [
        {
          id: 7,
          titel: "Gearchiveerd",
          korteOmschrijving: "Uitleg.",
          status: "gearchiveerd",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.99),
          stappen: [{ id: "s1", titel: "Stap", embedding: embeddingVoorScore(0.99) }],
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.hits.some((h) => h.id === 7)).toBe(false);
  });

  it("4. Bij gelijke score wint een handleidingstap altijd van een PDF-handleiding (manual)", async () => {
    const { payload } = maakFakePayload({
      handleidingen: [
        {
          id: 8,
          titel: "Gestructureerde handleiding",
          korteOmschrijving: "Uitleg.",
          status: "gepubliceerd",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.4),
          stappen: [{ id: "s1", titel: "Stap", embedding: embeddingVoorScore(0.8) }],
        },
      ],
      "knowledge-sources": [
        { id: 9, title: "PDF-handleiding", type: "pdf", priority: "core", embeddingStatus: "indexed", embedding: embeddingVoorScore(0.8) },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, { query: "iets", limiet: 1, drempelVoorVoldoende: DREMPEL });

    expect(resultaat.hits).toHaveLength(1);
    expect(resultaat.hits[0]?.bronrol).toBe("handleidingstap");
  });

  it("5. Een release note wint nog steeds van een handleidingstap bij gelijke score", async () => {
    const { payload } = maakFakePayload({
      handleidingen: [
        {
          id: 10,
          titel: "Handleiding",
          korteOmschrijving: "Uitleg.",
          status: "gepubliceerd",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.4),
          stappen: [{ id: "s1", titel: "Stap", embedding: embeddingVoorScore(0.8) }],
        },
      ],
      "knowledge-sources": [
        {
          id: 11,
          title: "Release notes juli",
          type: "release_notes",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, { query: "iets", limiet: 1, drempelVoorVoldoende: DREMPEL });

    expect(resultaat.hits).toHaveLength(1);
    expect(resultaat.hits[0]?.bronrol).toBe("release-note");
  });
});
