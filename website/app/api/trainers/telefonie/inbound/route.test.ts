import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { twilioProvider } from "@/lib/trainers/telefonie/twilio-provider";
import { verwerkInkomendeCall } from "@/lib/trainers/telefonie/gesprek";
import type { TelefonieProvider } from "@/lib/trainers/telefonie/provider";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — dekt uitsluitend de HTTP-laag
// van POST .../telefonie/inbound: signatuurverificatie, rate limiting,
// nette-TwiML-bij-fout (spec §19). De orchestratie zelf (verwerkInkomendeCall)
// heeft al eigen, uitgebreide dekking in lib/trainers/telefonie/
// gesprek.test.ts — zelfde scheiding als elke andere route-test in dit
// project t.o.v. zijn lib/-tegenhanger.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/telefonie/twilio-provider", () => ({ twilioProvider: vi.fn() }));
vi.mock("@/lib/trainers/telefonie/gesprek", () => ({ verwerkInkomendeCall: vi.fn() }));

const mockTwilioProvider = vi.mocked(twilioProvider);
const mockVerwerkInkomendeCall = vi.mocked(verwerkInkomendeCall);

function maakFakeProvider(overrides: Partial<TelefonieProvider> = {}): TelefonieProvider {
  return {
    naam: "fake",
    verifieerWebhookSignature: vi.fn().mockReturnValue(true),
    ontleedInkomendeCall: vi.fn(),
    ontleedGatherResultaat: vi.fn(),
    ontleedOpnameStatus: vi.fn(),
    bouwVoiceResponse: vi.fn((instructies) => `<Response>${JSON.stringify(instructies)}</Response>`),
    haalOpnameOp: vi.fn(),
    verwijderOpname: vi.fn(),
    ...overrides,
  };
}

function maakRequest(from = "+31612345678", extra: Record<string, string> = {}) {
  const form = new URLSearchParams({ CallSid: "CA1", From: from, ...extra });
  return new NextRequest("https://trainers.mijnleerlijn.nl/api/trainers/telefonie/inbound", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": "sig" },
    body: form.toString(),
  });
}

beforeEach(() => {
  mockVerwerkInkomendeCall.mockReset();
});

describe("POST /api/trainers/telefonie/inbound", () => {
  it("geldige signature -> 200, text/xml, geeft de instructies van verwerkInkomendeCall door aan bouwVoiceResponse", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkInkomendeCall.mockResolvedValue([{ soort: "zeg_en_ophangen", tekst: "Hallo." }]);

    const response = await POST(maakRequest("+31600000001"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/xml");
    expect(mockVerwerkInkomendeCall).toHaveBeenCalledWith(expect.anything(), provider, expect.objectContaining({ CallSid: "CA1", From: "+31600000001" }));
    expect(provider.bouwVoiceResponse).toHaveBeenCalledWith([{ soort: "zeg_en_ophangen", tekst: "Hallo." }]);
  });

  it("scenario 12: ontbrekende signature-header -> 403, verwerkInkomendeCall nooit aangeroepen", async () => {
    const provider = maakFakeProvider({ verifieerWebhookSignature: vi.fn().mockReturnValue(false) });
    mockTwilioProvider.mockReturnValue(provider);

    const response = await POST(maakRequest("+31600000002"));

    expect(response.status).toBe(403);
    expect(mockVerwerkInkomendeCall).not.toHaveBeenCalled();
  });

  it("scenario 12: ongeldige signature -> 403, geen verwerking", async () => {
    const provider = maakFakeProvider({ verifieerWebhookSignature: vi.fn().mockReturnValue(false) });
    mockTwilioProvider.mockReturnValue(provider);

    const response = await POST(maakRequest("+31600000003"));

    expect(response.status).toBe(403);
    expect(mockVerwerkInkomendeCall).not.toHaveBeenCalled();
  });

  it("spec §19: een onverwachte fout in verwerkInkomendeCall leidt NOOIT tot een 5xx richting Twilio — altijd nette TwiML, HTTP 200", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkInkomendeCall.mockRejectedValue(new Error("database tijdelijk onbereikbaar"));

    const response = await POST(maakRequest("+31600000004"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/xml");
    expect(provider.bouwVoiceResponse).toHaveBeenCalledWith([{ soort: "zeg_en_ophangen", tekst: expect.stringContaining("Er ging iets mis") }]);
  });

  it("rate limiting: na 20 aanvragen binnen het venster van hetzelfde nummer krijgt de 21e een nette 'te veel aanvragen'-boodschap i.p.v. verwerking, altijd nog HTTP 200", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkInkomendeCall.mockResolvedValue([{ soort: "zeg_en_ophangen", tekst: "ok" }]);

    const nummer = "+31600009999"; // uniek voor deze test, voorkomt state-lekkage met andere tests (de rate limiter leeft op modulevlak)
    let laatsteResponse: Response | undefined;
    for (let i = 0; i < 21; i++) {
      laatsteResponse = await POST(maakRequest(nummer));
    }

    expect(laatsteResponse!.status).toBe(200);
    expect(mockVerwerkInkomendeCall).toHaveBeenCalledTimes(20);
    const laatsteAanroepenTeksten = provider.bouwVoiceResponse as ReturnType<typeof vi.fn>;
    const laatsteInstructies = laatsteAanroepenTeksten.mock.calls.at(-1)![0];
    expect(laatsteInstructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Te veel aanvragen. Probeer het later opnieuw." }]);
  });
});
