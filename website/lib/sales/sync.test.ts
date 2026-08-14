import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { verwerkUpdate, type SyncResultaat } from "./sync";
import { MIGRATIE_MARKER } from "./monday-columns";
import type { MondayUpdate } from "./monday-client";

const mockFind = vi.fn();
const mockCreate = vi.fn();

function maakPayload() {
  return { find: mockFind, create: mockCreate } as unknown as Payload;
}

function leegResultaat(): SyncResultaat {
  return { scholenVerwerkt: 0, scholenNieuw: 0, scholenBijgewerkt: 0, updatesNieuw: 0, updatesOvergeslagen: 0, fouten: [] };
}

function maakUpdate(overrides: Partial<MondayUpdate> = {}): MondayUpdate {
  return {
    id: "u1",
    item_id: "12770146980",
    text_body: "Beste Bianca, leuk dat je contact opnam.",
    created_at: "2026-08-11T06:43:57.000Z",
    updated_at: "2026-08-11T06:43:57.000Z",
    creator: { id: "2496953", name: "Michel de Hond" },
    ...overrides,
  };
}

describe("verwerkUpdate — idempotentie en migratiedetectie", () => {
  beforeEach(() => {
    mockFind.mockReset();
    mockCreate.mockReset();
  });

  it("slaat een Update over die al als sourceExternalId bestaat — voorkomt duplicaten bij overlappende sync-vensters", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 1 }] });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12770146980", 42]]);

    const uitkomst = await verwerkUpdate(maakPayload(), maakUpdate(), schoolMap, resultaat);

    expect(uitkomst).toBeNull();
    expect(resultaat.updatesOvergeslagen).toBe(1);
    expect(resultaat.updatesNieuw).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("negeert een Update op een item dat niet als sales-school gesynchroniseerd is (geen matching schoolId)", async () => {
    const resultaat = leegResultaat();
    const schoolMap = new Map<string, number>(); // leeg — geen enkel item bekend

    const uitkomst = await verwerkUpdate(maakPayload(), maakUpdate(), schoolMap, resultaat);

    expect(uitkomst).toBeNull();
    expect(mockFind).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maakt een nieuwe, geminimaliseerde sales-log-events-regel aan voor een echt nieuwe Update — geen volledige ruwe tekst in payload", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 5 });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12770146980", 42]]);

    const uitkomst = await verwerkUpdate(maakPayload(), maakUpdate({ text_body: "Beste Bianca,\nLeuk dat je contact opnam met MijnLeerlijn." }), schoolMap, resultaat);

    expect(uitkomst).toEqual({ occurredAt: "2026-08-11T06:43:57.000Z", gemigreerd: false, schoolId: 42 });
    expect(resultaat.updatesNieuw).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0]![0];
    expect(call.collection).toBe("sales-log-events");
    expect(call.data.school).toBe(42);
    expect(call.data.sourceExternalId).toBe("u1");
    expect(call.data.summary).not.toContain("MijnLeerlijn.\nLeuk"); // geen letterlijke meerregelige ruwe tekst
    expect(call.data.summary.length).toBeLessThanOrEqual(161); // 160 + ellipsis
    expect(call.data.payload).toEqual({ gemigreerd: false, tekstlengte: expect.any(Number) });
    expect(call.data.payload.tekstlengte).toBeGreaterThan(0);
  });

  it("herkent een gemigreerde Update en markeert die als zodanig — telt niet als actueel contactmoment", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 6 });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12752866980", 7]]);

    const uitkomst = await verwerkUpdate(
      maakPayload(),
      maakUpdate({
        id: "u2",
        item_id: "12752866980",
        text_body: `${MIGRATIE_MARKER} (oud Sales-board)\nOude salesgroep: Beslissen\nLaatste contact: 2026-07-15`,
        created_at: "2026-08-08T13:20:30.000Z",
      }),
      schoolMap,
      resultaat
    );

    expect(uitkomst?.gemigreerd).toBe(true);
    const call = mockCreate.mock.calls[0]![0];
    expect(call.data.payload.gemigreerd).toBe(true);
  });

  it("schoont een e-mailadres/telefoonnummer in de samenvatting — geen volledige contactgegevens lokaal bewaard", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 7 });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12770146980", 42]]);

    await verwerkUpdate(maakPayload(), maakUpdate({ text_body: "Bel me op 06-12345678 of mail naar test@school.nl" }), schoolMap, resultaat);

    const call = mockCreate.mock.calls[0]![0];
    expect(call.data.summary).not.toContain("test@school.nl");
    expect(call.data.summary).not.toContain("06-12345678");
  });
});
