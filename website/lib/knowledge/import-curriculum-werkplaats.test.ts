import { describe, it, expect } from "vitest";
import { importeerCurriculumWerkplaatsKennis } from "./import-curriculum-werkplaats";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { handleiding, kennisartikelen } from "@/payload/import-curriculum-werkplaats/data";

// Helpdesk-beheerkoppeling-uitbreiding 2026-08-10: de admin-only
// productieroute (app/api/knowledge/import-curriculum-werkplaats/route.ts)
// en het CLI-script (payload/import-curriculum-werkplaats/index.ts) delen
// deze functie — hier getest zonder echte database via maakFakePayload
// (zelfde patroon als lib/knowledge/sync-manuals.test.ts).

const CATEGORY_ID = 1;
const VERWACHTE_SLUGS = [handleiding.slug, ...kennisartikelen.map((a) => a.slug)];

function maakSeed(extra: Record<string, { id: number; [key: string]: unknown }[]> = {}) {
  return {
    categories: [{ id: CATEGORY_ID, slug: "curriculum-werkplaats", title: "Curriculum Werkplaats" }],
    ...extra,
  };
}

describe("importeerCurriculumWerkplaatsKennis — eerste run", () => {
  it("importeert precies de 19 verwachte documenten (1 handleiding + 18 kennisartikelen), niets meer en niets minder", async () => {
    const { payload, collection } = maakFakePayload(maakSeed());

    const resultaat = await importeerCurriculumWerkplaatsKennis(payload);

    expect(resultaat).toMatchObject({ aangemaakt: 19, bijgewerkt: 0, verwerkt: 19, fouten: [] });
    expect(VERWACHTE_SLUGS).toHaveLength(19);

    const artikelen = collection("articles");
    expect(artikelen).toHaveLength(19);
    const geimporteerdeSlugs = artikelen.map((a) => a.slug).sort();
    expect(geimporteerdeSlugs).toEqual([...VERWACHTE_SLUGS].sort());
  });

  it("maakt precies één bron aan ('Curriculum Werkplaats (applicatie)'), niet één per artikel", async () => {
    const { payload, collection } = maakFakePayload(maakSeed());

    await importeerCurriculumWerkplaatsKennis(payload);

    const bronnen = collection("sources");
    expect(bronnen).toHaveLength(1);
    expect(bronnen[0]).toMatchObject({ title: "Curriculum Werkplaats (applicatie)" });
  });
});

describe("importeerCurriculumWerkplaatsKennis — herhaald uitvoeren (idempotentie)", () => {
  it("maakt bij een tweede run geen duplicaten aan — alles wordt bijgewerkt, niet opnieuw aangemaakt", async () => {
    const { payload, collection } = maakFakePayload(maakSeed());

    await importeerCurriculumWerkplaatsKennis(payload);
    const tweedeResultaat = await importeerCurriculumWerkplaatsKennis(payload);

    expect(tweedeResultaat).toMatchObject({ aangemaakt: 0, bijgewerkt: 19, verwerkt: 19, fouten: [] });
    expect(collection("articles")).toHaveLength(19);
    expect(collection("sources")).toHaveLength(1);
  });

  it("blijft idempotent over drie opeenvolgende rondes", async () => {
    const { payload, collection } = maakFakePayload(maakSeed());

    await importeerCurriculumWerkplaatsKennis(payload);
    await importeerCurriculumWerkplaatsKennis(payload);
    await importeerCurriculumWerkplaatsKennis(payload);

    expect(collection("articles")).toHaveLength(19);
    const slugs = collection("articles").map((a) => a.slug);
    expect(new Set(slugs).size).toBe(19);
  });
});

describe("importeerCurriculumWerkplaatsKennis — bestaande content blijft onaangeraakt", () => {
  it("laat een bestaand, ongerelateerd artikel volledig ongewijzigd staan", async () => {
    const ongerelateerdArtikel = {
      id: 42,
      slug: "hoe-werkt-groepsanalyse",
      title: "Hoe werkt groepsanalyse?",
      summary: "Bestaand MijnLeerlijn-artikel, niets mee te maken met Curriculum Werkplaats.",
      category: 99,
      articleStatus: "gepubliceerd",
    };
    const { payload, collection } = maakFakePayload(
      maakSeed({ articles: [ongerelateerdArtikel] })
    );

    await importeerCurriculumWerkplaatsKennis(payload);

    const artikelen = collection("articles");
    expect(artikelen).toHaveLength(20); // 1 bestaand + 19 nieuw geïmporteerd
    const nogSteedsAanwezig = artikelen.find((a) => a.id === 42);
    expect(nogSteedsAanwezig).toEqual(ongerelateerdArtikel);
  });

  it("laat een bestaande, ongerelateerde bron ongewijzigd en maakt er geen tweede aan met dezelfde titel als de Curriculum-bron", async () => {
    const bestaandeBron = { id: 7, title: "Een andere handleidingbron", type: "interne_handleiding" };
    const { payload, collection } = maakFakePayload(maakSeed({ sources: [bestaandeBron] }));

    await importeerCurriculumWerkplaatsKennis(payload);

    const bronnen = collection("sources");
    expect(bronnen).toHaveLength(2); // de bestaande + de nieuwe Curriculum Werkplaats-bron
    expect(bronnen.find((b) => b.id === 7)).toEqual(bestaandeBron);
  });
});

describe("importeerCurriculumWerkplaatsKennis — ontbrekende categorie", () => {
  it("importeert niets en rapporteert één duidelijke fout als de categorie nog niet bestaat", async () => {
    const { payload, collection } = maakFakePayload({}); // geen categories-seed

    const resultaat = await importeerCurriculumWerkplaatsKennis(payload);

    expect(resultaat).toMatchObject({ aangemaakt: 0, bijgewerkt: 0, verwerkt: 0 });
    expect(resultaat.fouten).toHaveLength(1);
    expect(resultaat.fouten[0]?.melding).toMatch(/npm run seed/);
    expect(collection("articles")).toHaveLength(0);
  });
});
