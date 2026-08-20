import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { twilioProvider } from "@/lib/trainers/telefonie/twilio-provider";
import { verwerkTrainingKeuze } from "@/lib/trainers/telefonie/gesprek";
import type { TelefonieProvider } from "@/lib/trainers/telefonie/provider";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — dekt uitsluitend de HTTP-laag
// van POST .../telefonie/kies-training. Zelfde scheiding als ../inbound/
// route.test.ts — de orchestratie zelf zit in gesprek.test.ts.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/telefonie/twilio-provider", () => ({ twilioProvider: vi.fn() }));
vi.mock("@/lib/trainers/telefonie/gesprek", () => ({ verwerkTrainingKeuze: vi.fn() }));

const mockTwilioProvider = vi.mocked(twilioProvider);
const mockVerwerkTrainingKeuze = vi.mocked(verwerkTrainingKeuze);

function maakFakeProvider(overrides: Partial<TelefonieProvider> = {}): TelefonieProvider {
  return {
    naam: "fake",
    verifieerWebhookSignature: vi.fn().mockReturnValue(true),
    ontleedInkomendeCall: vi.fn(),
    ontleedGatherResultaat: vi.fn(),
    ontleedOpnameStatus: vi.fn(),
    bouwVoiceResponse: vi.fn(() => "<Response/>"),
    haalOpnameOp: vi.fn(),
    verwijderOpname: vi.fn(),
    ...overrides,
  };
}

function maakRequest(oproepId: string | null, callSid = "CA1", digits = "1") {
  const form = new URLSearchParams({ CallSid: callSid, Digits: digits });
  const url = new URL("https://trainers.mijnleerlijn.nl/api/trainers/telefonie/kies-training");
  if (oproepId !== null) url.searchParams.set("oproepId", oproepId);
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": "sig" },
    body: form.toString(),
  });
}

beforeEach(() => {
  mockVerwerkTrainingKeuze.mockReset();
});

describe("POST /api/trainers/telefonie/kies-training", () => {
  it("geldige signature + geldig oproepId -> roept verwerkTrainingKeuze met het numerieke oproepId aan, 200 text/xml", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkTrainingKeuze.mockResolvedValue([{ soort: "zeg_en_ophangen", tekst: "ok" }]);

    const response = await POST(maakRequest("42"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/xml");
    expect(mockVerwerkTrainingKeuze).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ Digits: "1" }));
  });

  it("ontbrekend oproepId in de querystring -> nette TwiML-boodschap, geen aanroep (nooit op query-alleen vertrouwen zonder validatie)", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);

    const response = await POST(maakRequest(null, "CA-missend"));

    expect(response.status).toBe(200);
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
  });

  it("niet-numeriek oproepId -> nette TwiML-boodschap, geen aanroep", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);

    const response = await POST(maakRequest("niet-een-getal", "CA-onzin"));

    expect(response.status).toBe(200);
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
  });

  it("scenario 12: ontbrekende/ongeldige signature -> 403, geen aanroep", async () => {
    const provider = maakFakeProvider({ verifieerWebhookSignature: vi.fn().mockReturnValue(false) });
    mockTwilioProvider.mockReturnValue(provider);

    const response = await POST(maakRequest("42", "CA-badsig"));

    expect(response.status).toBe(403);
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
  });

  it("spec §19: onverwachte fout -> nette TwiML, altijd HTTP 200", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkTrainingKeuze.mockRejectedValue(new Error("boom"));

    const response = await POST(maakRequest("42", "CA-fout"));

    expect(response.status).toBe(200);
    expect(provider.bouwVoiceResponse).toHaveBeenCalledWith([{ soort: "zeg_en_ophangen", tekst: expect.stringContaining("Er ging iets mis") }]);
  });

  it("rate limiting: 21e aanvraag van dezelfde CallSid binnen het venster wordt geweigerd met een nette boodschap, nog altijd HTTP 200", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkTrainingKeuze.mockResolvedValue([{ soort: "zeg_en_ophangen", tekst: "ok" }]);

    const uniekeCallSid = "CA-ratelimit-kt-1"; // uniek voor deze test — voorkomt lekkage met de modulevlak-rate-limiter
    let laatsteResponse: Response | undefined;
    for (let i = 0; i < 21; i++) {
      laatsteResponse = await POST(maakRequest("42", uniekeCallSid));
    }

    expect(laatsteResponse!.status).toBe(200);
    expect(mockVerwerkTrainingKeuze).toHaveBeenCalledTimes(20);
  });
});
