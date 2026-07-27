import { describe, it, expect, vi, beforeEach } from "vitest";
import { bepaalIntentie } from "./bepaal-intentie";
import { generateStructuredOutput } from "@/services/ai-client";
import { maakFakePayload } from "@/lib/support/fake-payload";

vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));

const mockGenerate = vi.mocked(generateStructuredOutput);

beforeEach(() => {
  mockGenerate.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

function seed(onderwerpen: Record<string, unknown>[]) {
  return maakFakePayload({ "kennisbasis-onderwerpen": onderwerpen as { id: number }[] }).payload;
}

const ONDERWERP_1 = {
  id: 1,
  onderwerp: "Doelen koppelen aan één leerling",
  officieleTerm: "Leerdoel toevoegen aan leerling",
  synoniemen: ["doelen", "leerdoelen", "leerling", "kind"],
  status: "gepubliceerd",
  updatedAt: "2026-07-20T10:00:00.000Z",
};
const ONDERWERP_2 = {
  id: 2,
  onderwerp: "Doelenset koppelen aan meerdere leerlingen",
  officieleTerm: "Doelenset koppelen aan leerlingen",
  synoniemen: ["doelenset", "set doelen", "groep", "klas"],
  verduidelijkingsvraag: "Wil je doelen aan één leerling koppelen, of een doelenset aan meerdere leerlingen?",
  status: "gepubliceerd",
  updatedAt: "2026-07-25T10:00:00.000Z",
};

describe("bepaalIntentie — geen kennisbasis of geen match", () => {
  it("geeft geen-match terug zonder AI-aanroep als er geen gepubliceerde onderwerpen zijn", async () => {
    const payload = seed([]);

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik een leerling aan doelen?");

    expect(uitkomst).toEqual({ type: "geen-match", kandidaten: [], kennisbasisVersion: null });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("negeert een concept-onderwerp (telt niet mee, geen AI-aanroep nodig)", async () => {
    const payload = seed([{ ...ONDERWERP_1, status: "concept" }]);

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik een leerling aan doelen?");

    expect(uitkomst).toEqual({ type: "geen-match", kandidaten: [], kennisbasisVersion: null });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("geeft geen-match als het model geen kandidaten vindt", async () => {
    const payload = seed([ONDERWERP_1]);
    mockGenerate.mockResolvedValue({
      kandidaten: [],
      gekozenId: null,
      verduidelijkingsvraag: null,
      gebruikteSynoniem: null,
    });

    const uitkomst = await bepaalIntentie(payload, "Wat is het weer vandaag?");

    expect(uitkomst).toEqual({
      type: "geen-match",
      kandidaten: [],
      kennisbasisVersion: "2026-07-20T10:00:00.000Z",
    });
  });

  it("geeft geen-match zonder te crashen als de AI-aanroep faalt", async () => {
    const payload = seed([ONDERWERP_1]);
    mockGenerate.mockRejectedValue(new Error("model onbereikbaar"));

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik een leerling aan doelen?");

    expect(uitkomst).toEqual({
      type: "geen-match",
      kandidaten: [],
      kennisbasisVersion: "2026-07-20T10:00:00.000Z",
    });
  });

  it("geeft geen-match als gekozenId niet bij een bestaand onderwerp hoort", async () => {
    const payload = seed([ONDERWERP_1]);
    mockGenerate.mockResolvedValue({
      kandidaten: [1],
      gekozenId: 999,
      verduidelijkingsvraag: null,
      gebruikteSynoniem: null,
    });

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik een leerling aan doelen?");

    expect(uitkomst).toMatchObject({ type: "geen-match", kandidaten: [1] });
  });
});

describe("bepaalIntentie — opgelost", () => {
  it("lost op naar het enige kandidaat-onderwerp, ook zonder expliciete gekozenId", async () => {
    const payload = seed([ONDERWERP_1]);
    mockGenerate.mockResolvedValue({
      kandidaten: [1],
      gekozenId: null,
      verduidelijkingsvraag: null,
      gebruikteSynoniem: null,
    });

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik een leerling aan leerdoelen?");

    expect(uitkomst).toEqual({
      type: "opgelost",
      onderwerpId: 1,
      onderwerp: "Doelen koppelen aan één leerling",
      officieleTerm: "Leerdoel toevoegen aan leerling",
      kandidaten: [1],
      gebruikteSynoniem: null,
      kennisbasisVersion: "2026-07-20T10:00:00.000Z",
    });
  });

  it("gebruikt de officiële term, niet de letterlijke formulering van de gebruiker", async () => {
    const payload = seed([ONDERWERP_1, ONDERWERP_2]);
    mockGenerate.mockResolvedValue({
      kandidaten: [1],
      gekozenId: 1,
      verduidelijkingsvraag: null,
      gebruikteSynoniem: "doelen",
    });

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik een leerling aan doelen?");

    expect(uitkomst).toMatchObject({ type: "opgelost", officieleTerm: "Leerdoel toevoegen aan leerling" });
  });

  it("legt de door het model gerapporteerde gebruikte synoniem vast", async () => {
    const payload = seed([ONDERWERP_1]);
    mockGenerate.mockResolvedValue({
      kandidaten: [1],
      gekozenId: 1,
      verduidelijkingsvraag: null,
      gebruikteSynoniem: "  leerdoelen  ",
    });

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik een leerling aan leerdoelen?");

    expect(uitkomst).toMatchObject({ type: "opgelost", gebruikteSynoniem: "leerdoelen" });
  });

  it("neemt de kennisbasisversie over als de meest recente updatedAt onder de opgehaalde onderwerpen", async () => {
    const payload = seed([ONDERWERP_1, ONDERWERP_2]);
    mockGenerate.mockResolvedValue({
      kandidaten: [1],
      gekozenId: 1,
      verduidelijkingsvraag: null,
      gebruikteSynoniem: null,
    });

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik een leerling aan doelen?");

    expect(uitkomst).toMatchObject({ kennisbasisVersion: "2026-07-25T10:00:00.000Z" });
  });
});

describe("bepaalIntentie — verduidelijkingsvraag bij echte ambiguïteit", () => {
  it("gebruikt de vooraf ingevulde verduidelijkingsvraag van het onderwerp, niet die van het model", async () => {
    const payload = seed([ONDERWERP_1, ONDERWERP_2]);
    mockGenerate.mockResolvedValue({
      kandidaten: [1, 2],
      gekozenId: null,
      verduidelijkingsvraag: "een andere, door het model verzonnen vraag",
      gebruikteSynoniem: null,
    });

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik doelen aan leerlingen?");

    expect(uitkomst).toEqual({
      type: "onduidelijk",
      vraag: "Wil je doelen aan één leerling koppelen, of een doelenset aan meerdere leerlingen?",
      kandidaten: [1, 2],
      kennisbasisVersion: "2026-07-25T10:00:00.000Z",
    });
  });

  it("valt terug op de vraag van het model als geen van de kandidaten een eigen verduidelijkingsvraag heeft", async () => {
    const payload = seed([
      { ...ONDERWERP_1, verduidelijkingsvraag: undefined },
      { ...ONDERWERP_2, verduidelijkingsvraag: undefined },
    ]);
    mockGenerate.mockResolvedValue({
      kandidaten: [1, 2],
      gekozenId: null,
      verduidelijkingsvraag: "Bedoel je functie A of functie B?",
      gebruikteSynoniem: null,
    });

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik doelen aan leerlingen?");

    expect(uitkomst).toMatchObject({ type: "onduidelijk", vraag: "Bedoel je functie A of functie B?" });
  });

  it("kiest de kandidaat met de hoogste prioriteit als er geen enkele verduidelijkingsvraag beschikbaar is", async () => {
    const payload = seed([
      { ...ONDERWERP_1, verduidelijkingsvraag: undefined, prioriteit: 1 },
      { ...ONDERWERP_2, verduidelijkingsvraag: undefined, prioriteit: 5 },
    ]);
    mockGenerate.mockResolvedValue({
      kandidaten: [1, 2],
      gekozenId: null,
      verduidelijkingsvraag: null,
      gebruikteSynoniem: null,
    });

    const uitkomst = await bepaalIntentie(payload, "Hoe koppel ik doelen aan leerlingen?");

    expect(uitkomst).toMatchObject({ type: "opgelost", onderwerpId: 2, gebruikteSynoniem: null });
  });
});
