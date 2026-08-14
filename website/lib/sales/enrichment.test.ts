import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { genereerTypeSchoolVoorstel } from "./enrichment";
import { haalUpdatesVoorItem, leesKolomWaarde } from "./monday-client";
import { generateStructuredOutput } from "@/services/ai-client";

vi.mock("./monday-client", () => ({ haalUpdatesVoorItem: vi.fn(), leesKolomWaarde: vi.fn() }));
vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));
const mockHaalUpdates = vi.mocked(haalUpdatesVoorItem);
const mockLeesKolom = vi.mocked(leesKolomWaarde);
const mockGenerate = vi.mocked(generateStructuredOutput);

const mockFindByID = vi.fn();
const mockFind = vi.fn();
const mockCreate = vi.fn();

function maakPayload(): Payload {
  return { findByID: mockFindByID, find: mockFind, create: mockCreate } as unknown as Payload;
}

const SCHOOL = { id: 1, mondayItemId: "111", onderwijstype: null };

beforeEach(() => {
  mockFindByID.mockReset().mockResolvedValue(SCHOOL);
  mockFind.mockReset().mockResolvedValue({ docs: [] }); // geen bestaand pending voorstel
  mockCreate.mockReset().mockResolvedValue({ id: 900 });
  mockHaalUpdates.mockReset();
  mockLeesKolom.mockReset().mockResolvedValue(null);
  mockGenerate.mockReset();
});

describe("genereerTypeSchoolVoorstel", () => {
  it("doet niets als het onderwijstype al gezet is", async () => {
    mockFindByID.mockResolvedValue({ ...SCHOOL, onderwijstype: 5 });

    const resultaat = await genereerTypeSchoolVoorstel(maakPayload(), 1);

    expect(resultaat.aangemaakt).toBe(false);
    expect(mockHaalUpdates).not.toHaveBeenCalled();
  });

  it("doet niets als er al een pending veldvoorstel voor dit veld bestaat", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 1 }] });

    const resultaat = await genereerTypeSchoolVoorstel(maakPayload(), 1);

    expect(resultaat.aangemaakt).toBe(false);
    expect(mockHaalUpdates).not.toHaveBeenCalled();
  });

  it("sluit gemigreerde Updates uit als brontekst", async () => {
    mockHaalUpdates.mockResolvedValue([
      { id: "u1", item_id: "111", text_body: "📜 Gemigreerde CRM-gegevens (oud Sales-board)\nType school: Montessori", created_at: "2026-08-08T00:00:00.000Z", updated_at: "2026-08-08T00:00:00.000Z", creator: null },
    ]);

    const resultaat = await genereerTypeSchoolVoorstel(maakPayload(), 1);

    expect(resultaat.aangemaakt).toBe(false);
    expect(resultaat.reden).toMatch(/gemigreerd/i);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("maakt geen voorstel aan wanneer de AI geen betrouwbare waarde herkent (waarde: null)", async () => {
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "Algemeen gesprek, geen onderwijstype genoemd.", created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:00:00.000Z", creator: null }]);
    mockGenerate.mockResolvedValue({ waarde: null, basis: "Niet genoemd.", confidence: "laag" });

    const resultaat = await genereerTypeSchoolVoorstel(maakPayload(), 1);

    expect(resultaat.aangemaakt).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maakt een veld_correctie-voorstel aan met bron-updates en confidence, óók bij 'laag' (filtering gebeurt bij ophalen, niet bij aanmaken)", async () => {
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "We werken montessori-achtig.", created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:00:00.000Z", creator: null }]);
    mockGenerate.mockResolvedValue({ waarde: "Montessori", basis: "'We werken montessori-achtig' in Update u1.", confidence: "middel" });
    mockLeesKolom.mockResolvedValue({ id: "dropdown_mm4v9rvg", text: null, value: null });

    const resultaat = await genereerTypeSchoolVoorstel(maakPayload(), 1);

    expect(resultaat.aangemaakt).toBe(true);
    const call = mockCreate.mock.calls.find((c) => c[0].collection === "sales-proposals")![0];
    expect(call.data.proposalType).toBe("veld_correctie");
    expect(call.data.targetColumnId).toBe("dropdown_mm4v9rvg");
    expect(call.data.proposedValue).toBe("Montessori");
    expect(call.data.confidence).toBe("middel");
    expect(call.data.sourceUpdateIds).toEqual([{ updateId: "u1" }]);
    expect(call.data.status).toBe("pending");
  });

  it("logt een ai_voorstel-gebeurtenis in het schoollogboek bij het aanmaken", async () => {
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "montessori", created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:00:00.000Z", creator: null }]);
    mockGenerate.mockResolvedValue({ waarde: "Montessori", basis: "x", confidence: "hoog" });

    await genereerTypeSchoolVoorstel(maakPayload(), 1);

    const logCall = mockCreate.mock.calls.find((c) => c[0].collection === "sales-log-events")![0];
    expect(logCall.data.type).toBe("ai_voorstel");
  });
});
