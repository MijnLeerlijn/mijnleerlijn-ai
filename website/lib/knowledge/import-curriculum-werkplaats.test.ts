import { describe, it, expect, vi } from "vitest";
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

describe("importeerCurriculumWerkplaatsKennis — categorie 'curriculum-werkplaats' bestaat al", () => {
  it("hergebruikt de bestaande categorie: geen tweede aangemaakt, de bestaande blijft volledig ongewijzigd", async () => {
    const bestaandeCategorie = {
      id: CATEGORY_ID,
      slug: "curriculum-werkplaats",
      title: "Aangepaste titel door een beheerder",
      icon: "PenTool",
      color: "purple",
      description: "Handmatig aangepaste omschrijving.",
    };
    const { payload, collection } = maakFakePayload({ categories: [bestaandeCategorie] });

    const resultaat = await importeerCurriculumWerkplaatsKennis(payload);

    expect(resultaat).toMatchObject({ aangemaakt: 19, bijgewerkt: 0, verwerkt: 19, fouten: [] });
    const categorieRijen = collection("categories");
    expect(categorieRijen).toHaveLength(1);
    // Nooit bijgewerkt naar de seed-standaardwaarden — "hergebruiken" betekent
    // hier letterlijk: alleen het id oppakken, nooit de bestaande rij zelf
    // aanraken, ook al wijkt die af van lib/data/categories.ts.
    expect(categorieRijen[0]).toEqual(bestaandeCategorie);
    expect(collection("articles").every((a) => a.category === CATEGORY_ID)).toBe(true);
  });
});

describe("importeerCurriculumWerkplaatsKennis — categorie 'curriculum-werkplaats' ontbreekt (self-healing)", () => {
  it("maakt uitsluitend de benodigde categorie aan, met exact dezelfde gegevens als de officiële seed (lib/data/categories.ts)", async () => {
    const { payload, collection } = maakFakePayload({}); // geen categories-seed

    const resultaat = await importeerCurriculumWerkplaatsKennis(payload);

    expect(resultaat).toMatchObject({ aangemaakt: 19, bijgewerkt: 0, verwerkt: 19, fouten: [] });
    const categorieRijen = collection("categories");
    expect(categorieRijen).toHaveLength(1);
    expect(categorieRijen[0]).toMatchObject({
      slug: "curriculum-werkplaats",
      title: "Curriculum Werkplaats",
      icon: "PenTool",
      color: "purple",
    });
    expect(typeof categorieRijen[0]?.description).toBe("string");
    expect((categorieRijen[0]?.description as string).length).toBeGreaterThan(0);

    const nieuweCategorieId = categorieRijen[0]?.id;
    expect(collection("articles").every((a) => a.category === nieuweCategorieId)).toBe(true);
  });

  it("maakt de categorie maar één keer aan, ook bij twee opeenvolgende imports (idempotent)", async () => {
    const { payload, collection } = maakFakePayload({});

    await importeerCurriculumWerkplaatsKennis(payload);
    await importeerCurriculumWerkplaatsKennis(payload);

    expect(collection("categories")).toHaveLength(1);
    expect(collection("articles")).toHaveLength(19);
  });

  it("raakt andere, bestaande categorieën niet aan", async () => {
    const andereCategorie = {
      id: 55,
      slug: "starten",
      title: "Starten met de software",
      icon: "Rocket",
      color: "blue",
      description: "Bestaand, ongerelateerd aan Curriculum Werkplaats.",
    };
    const { payload, collection } = maakFakePayload({ categories: [andereCategorie] });

    await importeerCurriculumWerkplaatsKennis(payload);

    const categorieRijen = collection("categories");
    expect(categorieRijen).toHaveLength(2); // de bestaande + de nieuw aangemaakte
    expect(categorieRijen.find((c) => c.id === 55)).toEqual(andereCategorie);
  });

  it("logt een leesbare regel met stap='categorie-upsert' als het aanmaken van de categorie zelf mislukt", async () => {
    const { payload } = maakFakePayload({});
    const oorspronkelijkeCreate = payload.create.bind(payload);
    (payload as unknown as { create: typeof payload.create }).create = (async (
      opts: Parameters<typeof payload.create>[0]
    ) => {
      if (opts.collection === "categories") {
        throw new Error("schrijven naar categories mislukt");
      }
      return oorspronkelijkeCreate(opts);
    }) as typeof payload.create;
    const foutSpy = vi.fn();
    payload.logger.error = foutSpy;

    const resultaat = await importeerCurriculumWerkplaatsKennis(payload);

    expect(resultaat).toMatchObject({ aangemaakt: 0, bijgewerkt: 0, verwerkt: 0 });
    expect(resultaat.fouten).toHaveLength(1);
    expect(foutSpy).toHaveBeenCalledTimes(1);
    const regel = foutSpy.mock.calls[0]?.[0] as string;
    expect(regel).toContain('stap="categorie-upsert"');
    expect(regel).toContain("fouttype=Error");
  });
});

describe("importeerCurriculumWerkplaatsKennis — diagnostische logging per mislukt document (tijdelijk)", () => {
  it("logt per mislukt document stap/fouttype/melding, en saniteert credentials uit een connectiestring in de foutmelding", async () => {
    const { payload } = maakFakePayload(maakSeed());
    const mislukteSlug = kennisartikelen[0]!.slug;
    const oorspronkelijkeCreate = payload.create.bind(payload);
    // Simuleert een database-driverfout die (zoals sommige drivers doen) de
    // rauwe connectiestring in de foutmelding terugecho't — precies het
    // scenario waar de sanitizer tegen moet beschermen.
    (payload as unknown as { create: typeof payload.create }).create = (async (
      opts: Parameters<typeof payload.create>[0]
    ) => {
      const data = (opts as { data?: Record<string, unknown> }).data;
      if (opts.collection === "articles" && data?.slug === mislukteSlug) {
        throw new Error(
          "verbinding mislukt: postgres://gebruiker:geheimwachtwoord123@db.voorbeeld.internal:5432/curriculum"
        );
      }
      return oorspronkelijkeCreate(opts);
    }) as typeof payload.create;
    const foutSpy = vi.fn();
    payload.logger.error = foutSpy;

    const resultaat = await importeerCurriculumWerkplaatsKennis(payload);

    expect(resultaat.fouten).toHaveLength(1);
    expect(resultaat.fouten[0]?.slug).toBe(mislukteSlug);
    expect(resultaat.fouten[0]?.melding).not.toMatch(/geheimwachtwoord123/);
    expect(resultaat.fouten[0]?.melding).toContain("://***:***@");

    expect(foutSpy).toHaveBeenCalledTimes(1);
    const regel = foutSpy.mock.calls[0]?.[0] as string;
    expect(regel).toContain(`stap="artikel:${mislukteSlug}"`);
    expect(regel).toContain("fouttype=Error");
    expect(regel).not.toMatch(/geheimwachtwoord123/);
    expect(regel).toContain("://***:***@");
  });
});
