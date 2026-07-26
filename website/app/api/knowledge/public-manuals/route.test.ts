import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

let huidigePayload: ReturnType<typeof maakFakePayload>["payload"];
vi.mock("payload", () => ({ getPayload: vi.fn(async () => huidigePayload) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/variant/get-active-variant", () => ({ getActiveVariant: vi.fn() }));

const mockVariant = vi.mocked(getActiveVariant);

// Variant.id (types/variant.ts) is een STRING (String(payload-numeriek-id))
// — zelfde als in de echte services/payload.ts-mapping, zie route.ts.
const MIJNLEERLIJN = { id: "1", slug: "mijnleerlijn" };
const MIJNMONTI = { id: "2", slug: "mijnmonti" };

beforeEach(() => {
  mockVariant.mockReset();
  mockVariant.mockResolvedValue(MIJNLEERLIJN as never);
});

function seed(bronnen: Record<string, unknown>[], categorieen: Record<string, unknown>[]) {
  const { payload } = maakFakePayload({
    "knowledge-sources": bronnen as { id: number }[],
    categories: categorieen as { id: number }[],
  });
  huidigePayload = payload;
}

describe("GET /api/knowledge/public-manuals", () => {
  it("toont alleen zichtbare bronnen met een categorie, gegroepeerd", async () => {
    seed(
      [
        { id: 1, title: "Doelenset aanmaken", zichtbaar: true, categorie: 10, file: 1 },
        { id: 2, title: "Niet-zichtbare bron", zichtbaar: false, categorie: 10, file: 1 },
        { id: 3, title: "Zichtbaar maar zonder categorie", zichtbaar: true, categorie: null, file: 1 },
      ],
      [{ id: 10, slug: "starten", title: "Starten", icon: "Rocket" }]
    );

    const response = await GET();
    const data = await response.json();

    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].manuals).toEqual([{ id: 1, title: "Doelenset aanmaken", hasFile: true }]);
  });

  it("geeft de categoriekleur mee (voor de kleuraccenten in de sidebar, livegang-afwerking)", async () => {
    seed(
      [{ id: 1, title: "Doelenset aanmaken", zichtbaar: true, categorie: 10, file: 1 }],
      [{ id: 10, slug: "starten", title: "Starten", icon: "Rocket", color: "groen" }]
    );

    const response = await GET();
    const data = await response.json();

    expect(data.categories[0].color).toBe("groen");
  });

  it("laat categorieën zonder enige zichtbare handleiding weg (geen lege accordeons)", async () => {
    seed(
      [{ id: 1, title: "Doelenset aanmaken", zichtbaar: true, categorie: 10, file: 1 }],
      [
        { id: 10, slug: "starten", title: "Starten", icon: "Rocket" },
        { id: 11, slug: "beheer", title: "Beheer", icon: "Settings" },
      ]
    );

    const response = await GET();
    const data = await response.json();

    expect(data.categories.map((c: { slug: string }) => c.slug)).toEqual(["starten"]);
  });

  it("sorteert op volgorde, dan alfabetisch bij ontbrekende volgorde", async () => {
    seed(
      [
        { id: 1, title: "Zebra-handleiding", zichtbaar: true, categorie: 10, volgorde: null },
        { id: 2, title: "Aap-handleiding", zichtbaar: true, categorie: 10, volgorde: null },
        { id: 3, title: "Met expliciete volgorde 1", zichtbaar: true, categorie: 10, volgorde: 5 },
      ],
      [{ id: 10, slug: "starten", title: "Starten", icon: "Rocket" }]
    );

    const response = await GET();
    const data = await response.json();

    expect(data.categories[0].manuals.map((m: { title: string }) => m.title)).toEqual([
      "Met expliciete volgorde 1",
      "Aap-handleiding",
      "Zebra-handleiding",
    ]);
  });

  it("geeft hasFile=false voor een zichtbare bron zonder bestand (bv. een URL-bron) — geen downloadknop", async () => {
    seed(
      [{ id: 1, title: "Website-bron", zichtbaar: true, categorie: 10, file: null }],
      [{ id: 10, slug: "starten", title: "Starten", icon: "Rocket" }]
    );

    const response = await GET();
    const data = await response.json();

    expect(data.categories[0].manuals[0]).toMatchObject({ hasFile: false });
  });

  it("toont een bron zonder variantContext (centraal) altijd, ongeacht de actieve variant", async () => {
    seed(
      [{ id: 1, title: "Centrale handleiding", zichtbaar: true, categorie: 10, variantContext: [] }],
      [{ id: 10, slug: "starten", title: "Starten", icon: "Rocket" }]
    );
    mockVariant.mockResolvedValue(MIJNMONTI as never);

    const response = await GET();
    const data = await response.json();

    expect(data.categories[0].manuals).toHaveLength(1);
  });

  it("verbergt een bron die aan een ANDERE variant gebonden is dan de actieve variant", async () => {
    seed(
      [
        {
          id: 1,
          title: "Alleen voor MijnMonti",
          zichtbaar: true,
          categorie: 10,
          variantContext: [Number(MIJNMONTI.id)], // numerieke Payload-relatie-id, niet Variant.id (string)
        },
      ],
      [{ id: 10, slug: "starten", title: "Starten", icon: "Rocket" }]
    );
    mockVariant.mockResolvedValue(MIJNLEERLIJN as never);

    const response = await GET();
    const data = await response.json();

    expect(data.categories).toHaveLength(0);
  });
});
