import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { vindActieveScholenZonderVervolgactie, vindScholenZonderVervolgactieGesplitst } from "./aandacht-nodig";
import { vandaagIso, voegDagenToe } from "./format-datum";

const mockFind = vi.fn();
function maakPayload(): Payload {
  return { find: mockFind } as unknown as Payload;
}

describe("vindActieveScholenZonderVervolgactie", () => {
  beforeEach(() => {
    mockFind.mockReset();
  });

  it("sluit een school met een open actie uit", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1, schoolName: "A" }, { id: 2, schoolName: "B" }] });
      if (collection === "sales-actions") return Promise.resolve({ docs: [{ school: 1 }] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindActieveScholenZonderVervolgactie(maakPayload());

    expect(resultaat.map((s) => s.id)).toEqual([2]);
  });

  it("sluit een school met een pending volgende_actie- of bestaande_vervolgdatum-voorstel uit", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1 }, { id: 2 }] });
      if (collection === "sales-proposals") return Promise.resolve({ docs: [{ school: 2 }] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindActieveScholenZonderVervolgactie(maakPayload());

    expect(resultaat.map((s) => s.id)).toEqual([1]);
  });

  it("bevraagt pending voorstellen uitsluitend op volgende_actie/bestaande_vervolgdatum — een veld_correctie-voorstel sluit een school niet uit", async () => {
    mockFind.mockImplementation(({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1 }] });
      if (collection === "sales-proposals") {
        // De aanroep zelf moet al filteren op proposalType — bevestig dat hier.
        expect(where?.proposalType).toEqual({ in: ["volgende_actie", "bestaande_vervolgdatum"] });
        return Promise.resolve({ docs: [] });
      }
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindActieveScholenZonderVervolgactie(maakPayload());

    expect(resultaat.map((s) => s.id)).toEqual([1]);
  });

  it("bevraagt sales-schools altijd met actief: true", async () => {
    mockFind.mockImplementation(({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") {
        expect(where).toEqual({ actief: { equals: true } });
        return Promise.resolve({ docs: [] });
      }
      return Promise.resolve({ docs: [] });
    });

    await vindActieveScholenZonderVervolgactie(maakPayload());
  });
});

describe("vindScholenZonderVervolgactieGesplitst — productiecorrectie 2026-08-16 (root cause punt 13)", () => {
  beforeEach(() => {
    mockFind.mockReset();
  });

  it("plaatst een school met een NIET-verlopen mondayVolgendeActieDatum en géén lokaal record onder geplandInMonday, niet onder zonderVervolgactie", async () => {
    const toekomstigeDatum = voegDagenToe(vandaagIso(), 30);
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1, schoolName: "Gepland", mondayVolgendeActieDatum: toekomstigeDatum }] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindScholenZonderVervolgactieGesplitst(maakPayload());

    expect(resultaat.geplandInMonday.map((s) => s.id)).toEqual([1]);
    expect(resultaat.zonderVervolgactie).toEqual([]);
  });

  it("plaatst een school met een VERLOPEN mondayVolgendeActieDatum en géén lokaal record onder zonderVervolgactie — verdient weer aandacht", async () => {
    const verlopenDatum = voegDagenToe(vandaagIso(), -10);
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1, schoolName: "Verlopen", mondayVolgendeActieDatum: verlopenDatum }] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindScholenZonderVervolgactieGesplitst(maakPayload());

    expect(resultaat.zonderVervolgactie.map((s) => s.id)).toEqual([1]);
    expect(resultaat.geplandInMonday).toEqual([]);
  });

  it("behandelt vandaag zelf als nog geldig (niet verlopen)", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1, schoolName: "Vandaag", mondayVolgendeActieDatum: vandaagIso() }] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindScholenZonderVervolgactieGesplitst(maakPayload());

    expect(resultaat.geplandInMonday.map((s) => s.id)).toEqual([1]);
  });

  it("plaatst een school zonder enige mondayVolgendeActieDatum onder zonderVervolgactie", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1, schoolName: "Niets", mondayVolgendeActieDatum: null }] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindScholenZonderVervolgactieGesplitst(maakPayload());

    expect(resultaat.zonderVervolgactie.map((s) => s.id)).toEqual([1]);
  });

  it("een school met een open lokale actie valt in geen van beide categorieën, ook niet met een toekomstige Monday-datum", async () => {
    const toekomstigeDatum = voegDagenToe(vandaagIso(), 5);
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1, schoolName: "Heeft actie", mondayVolgendeActieDatum: toekomstigeDatum }] });
      if (collection === "sales-actions") return Promise.resolve({ docs: [{ school: 1 }] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindScholenZonderVervolgactieGesplitst(maakPayload());

    expect(resultaat.geplandInMonday).toEqual([]);
    expect(resultaat.zonderVervolgactie).toEqual([]);
  });

  it("Inactief/Gestopt zijn nooit kandidaat (actief: false, buiten de sales-schools where-clause) — regressie punt 8", async () => {
    mockFind.mockImplementation(({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") {
        expect(where).toEqual({ actief: { equals: true } });
        return Promise.resolve({ docs: [] }); // Inactief/Gestopt hebben actief:false, matchen dit filter dus nooit
      }
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindScholenZonderVervolgactieGesplitst(maakPayload());

    expect(resultaat.zonderVervolgactie).toEqual([]);
    expect(resultaat.geplandInMonday).toEqual([]);
  });

  // Productiecorrectie 2026-08-16 (punt 14) — expliciet genoemd testscenario,
  // hier het "wordt NIET getoond als 'geen vervolgactie'"-deel. Zie
  // sync.test.ts voor het sync-deel en relationship-analysis.test.ts voor
  // het AI-deel van hetzelfde scenario (zelfde schoolnaam/datum).
  it("'2de Montessorischool Winterkoninkje' (Lead, Afspraak plannen, 3 nov 2026) staat in geplandInMonday, nooit in zonderVervolgactie", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") {
        return Promise.resolve({
          docs: [
            {
              id: 1,
              schoolName: "2de Montessorischool Winterkoninkje",
              relatiestatus: "Lead",
              salesfase: "Afspraak plannen",
              mondayVolgendeActieDatum: "2026-11-03",
            },
          ],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindScholenZonderVervolgactieGesplitst(maakPayload());

    expect(resultaat.geplandInMonday.map((s) => s.schoolName)).toEqual(["2de Montessorischool Winterkoninkje"]);
    expect(resultaat.zonderVervolgactie).toEqual([]);
  });
});
