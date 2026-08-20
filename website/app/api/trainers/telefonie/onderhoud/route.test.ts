import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { twilioProvider } from "@/lib/trainers/telefonie/twilio-provider";
import { verwerkTelefonieOnderhoud } from "@/lib/trainers/telefonie/gesprek";

// Traineromgeving V1, Ronde 3.5 vervolg (2026-08-25) — dekt uitsluitend de
// HTTP-laag van GET .../telefonie/onderhoud (de cron-getriggerde
// transcriptieherstelronde, production-readiness-gate 1). Zelfde
// CRON_SECRET-Bearer-authenticatiepatroon als app/api/sales/sync/route.ts —
// geen apart testbestand bestaat daar voor de GET-ingang zelf, dus dit
// bestand test die authenticatievorm voor het eerst expliciet, hier waar hij
// opnieuw wordt hergebruikt (geen nieuw mechanisme, spec-eis "gebruik
// bestaande scheduler/queue-primitives").
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/telefonie/twilio-provider", () => ({ twilioProvider: vi.fn() }));
vi.mock("@/lib/trainers/telefonie/gesprek", () => ({ verwerkTelefonieOnderhoud: vi.fn() }));

const mockTwilioProvider = vi.mocked(twilioProvider);
const mockVerwerkTelefonieOnderhoud = vi.mocked(verwerkTelefonieOnderhoud);

function maakRequest(headers: Record<string, string> = {}) {
  return new NextRequest(new URL("https://trainers.mijnleerlijn.nl/api/trainers/telefonie/onderhoud"), {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  mockVerwerkTelefonieOnderhoud.mockReset();
  mockTwilioProvider.mockReset();
  vi.unstubAllEnvs();
});

describe("GET /api/trainers/telefonie/onderhoud", () => {
  it("geen CRON_SECRET ingesteld -> 403, geen verwerking (nooit stilzwijgend openstaan zonder secret)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(maakRequest({ authorization: "Bearer wat-dan-ook" }));
    expect(response.status).toBe(403);
    expect(mockVerwerkTelefonieOnderhoud).not.toHaveBeenCalled();
  });

  it("ontbrekende Authorization-header -> 403, geen verwerking", async () => {
    vi.stubEnv("CRON_SECRET", "geheim123");
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockVerwerkTelefonieOnderhoud).not.toHaveBeenCalled();
  });

  it("onjuist secret -> 403, geen verwerking", async () => {
    vi.stubEnv("CRON_SECRET", "geheim123");
    const response = await GET(maakRequest({ authorization: "Bearer verkeerd" }));
    expect(response.status).toBe(403);
    expect(mockVerwerkTelefonieOnderhoud).not.toHaveBeenCalled();
  });

  it("juist secret -> roept verwerkTelefonieOnderhoud aan en geeft het resultaat als JSON terug", async () => {
    vi.stubEnv("CRON_SECRET", "geheim123");
    const provider = {} as ReturnType<typeof twilioProvider>;
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkTelefonieOnderhoud.mockResolvedValue({ geclaimd: 3 });

    const response = await GET(maakRequest({ authorization: "Bearer geheim123" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ geclaimd: 3 });
    expect(mockVerwerkTelefonieOnderhoud).toHaveBeenCalledWith(expect.anything(), provider);
  });

  it("een onverwachte fout in verwerkTelefonieOnderhoud geeft 500 met een generieke foutmelding (geen ruwe interne inhoud naar de aanroeper)", async () => {
    vi.stubEnv("CRON_SECRET", "geheim123");
    mockTwilioProvider.mockReturnValue({} as ReturnType<typeof twilioProvider>);
    mockVerwerkTelefonieOnderhoud.mockRejectedValue(new Error("database onbereikbaar"));

    const response = await GET(maakRequest({ authorization: "Bearer geheim123" }));
    expect(response.status).toBe(500);
  });
});
