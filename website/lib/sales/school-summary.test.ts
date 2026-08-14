import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { genereerEnCacheSchoolSamenvatting } from "./school-summary";
import { generateChatText } from "@/services/ai-client";
import { bouwSchoolContext, bouwSchoolPrompt } from "./context";

vi.mock("@/services/ai-client", () => ({ generateChatText: vi.fn() }));
vi.mock("./context", () => ({
  bouwSchoolContext: vi.fn(),
  bouwSchoolPrompt: vi.fn().mockReturnValue({ systemPrompt: "systeem", contextBericht: "context" }),
}));

const mockGenerate = vi.mocked(generateChatText);
const mockBouwContext = vi.mocked(bouwSchoolContext);
const mockBouwPrompt = vi.mocked(bouwSchoolPrompt);
const mockUpdate = vi.fn();

function maakPayload(): Payload {
  return { update: mockUpdate } as unknown as Payload;
}

describe("genereerEnCacheSchoolSamenvatting", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockBouwContext.mockReset().mockResolvedValue({
      school: { id: 42, schoolName: "School A", relatiestatus: "Prospect", salesfase: null, plaats: null, onderwijstype: null },
      recenteLogEvents: [],
      mijnleerlijnKennis: [],
      variantKennis: null,
    });
    mockBouwPrompt.mockReset().mockReturnValue({ systemPrompt: "systeem", contextBericht: "context" });
    mockUpdate.mockReset().mockResolvedValue({});
  });

  it("schoont het AI-resultaat met scrubPotentialPii vóórdat het wordt opgeslagen", async () => {
    mockGenerate.mockResolvedValue("Bel bianca@school.nl of 06-12345678 voor meer info.");

    const resultaat = await genereerEnCacheSchoolSamenvatting(maakPayload(), 42);

    expect(resultaat).not.toContain("bianca@school.nl");
    expect(resultaat).not.toContain("06-12345678");
    const call = mockUpdate.mock.calls[0]![0];
    expect(call.data.cachedSummary).not.toContain("bianca@school.nl");
  });

  it("slaat de samenvatting + het tijdstip op in sales-schools (cache), gescoped op het juiste school-ID", async () => {
    mockGenerate.mockResolvedValue("Korte samenvatting.");

    await genereerEnCacheSchoolSamenvatting(maakPayload(), 42);

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.collection).toBe("sales-schools");
    expect(call.id).toBe(42);
    expect(call.data.cachedSummary).toBe("Korte samenvatting.");
    expect(typeof call.data.cachedSummaryGeneratedAt).toBe("string");
  });

  it("hergebruikt bouwSchoolContext/bouwSchoolPrompt — geen tweede contextopbouw", async () => {
    mockGenerate.mockResolvedValue("x");

    await genereerEnCacheSchoolSamenvatting(maakPayload(), 42);

    expect(mockBouwContext).toHaveBeenCalledWith(expect.anything(), 42, expect.any(String));
    expect(mockBouwPrompt).toHaveBeenCalledTimes(1);
  });
});
