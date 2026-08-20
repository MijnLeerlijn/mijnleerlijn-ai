import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, maxDuration } from "./route";
import { twilioProvider } from "@/lib/trainers/telefonie/twilio-provider";
import { verwerkOpnameStatus } from "@/lib/trainers/telefonie/gesprek";
import type { TelefonieProvider } from "@/lib/trainers/telefonie/provider";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — dekt uitsluitend de HTTP-laag
// van POST .../telefonie/opname-status (Twilio's recordingStatusCallback).
// Deze route geeft NOOIT TwiML terug (Twilio verwacht hier geen
// call-control-inhoud) — uitsluitend een kale statuscode, vandaar de
// afwijkende assertions t.o.v. de andere 3 routes.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/telefonie/twilio-provider", () => ({ twilioProvider: vi.fn() }));
vi.mock("@/lib/trainers/telefonie/gesprek", () => ({ verwerkOpnameStatus: vi.fn() }));

const mockTwilioProvider = vi.mocked(twilioProvider);
const mockVerwerkOpnameStatus = vi.mocked(verwerkOpnameStatus);

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

function maakRequest(oproepId: string | null, recordingSid = "RE1") {
  const form = new URLSearchParams({ CallSid: "CA1", RecordingSid: recordingSid, RecordingStatus: "completed" });
  const url = new URL("https://trainers.mijnleerlijn.nl/api/trainers/telefonie/opname-status");
  if (oproepId !== null) url.searchParams.set("oproepId", oproepId);
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": "sig" },
    body: form.toString(),
  });
}

beforeEach(() => {
  mockVerwerkOpnameStatus.mockReset();
});

describe("POST /api/trainers/telefonie/opname-status", () => {
  it("maxDuration=300 (spec §8: tot 10-15 minuten dictatie + download + transcriptie + AI-structurering)", () => {
    expect(maxDuration).toBe(300);
  });

  it("geldige signature + geldig oproepId -> roept verwerkOpnameStatus aan, 200, GEEN TwiML-body", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkOpnameStatus.mockResolvedValue(undefined);

    const response = await POST(maakRequest("42"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(mockVerwerkOpnameStatus).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ RecordingSid: "RE1" }));
  });

  it("scenario 12: ontbrekende/ongeldige signature -> 403, geen verwerking", async () => {
    const provider = maakFakeProvider({ verifieerWebhookSignature: vi.fn().mockReturnValue(false) });
    mockTwilioProvider.mockReturnValue(provider);

    const response = await POST(maakRequest("42", "RE-badsig"));

    expect(response.status).toBe(403);
    expect(mockVerwerkOpnameStatus).not.toHaveBeenCalled();
  });

  it("ontbrekend/ongeldig oproepId -> 400, geen verwerking", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);

    expect((await POST(maakRequest(null, "RE-geen-id"))).status).toBe(400);
    expect((await POST(maakRequest("niet-numeriek", "RE-onzin-id"))).status).toBe(400);
    expect(mockVerwerkOpnameStatus).not.toHaveBeenCalled();
  });

  it("spec §19: een onverwachte fout in verwerkOpnameStatus wordt opgevangen — nooit een 5xx richting Twilio (voorkomt een onnodige retrystorm)", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkOpnameStatus.mockRejectedValue(new Error("onverwachte crash"));

    const response = await POST(maakRequest("42", "RE-crash"));
    expect(response.status).toBe(200);
  });

  it("rate limiting: 21e aanvraag voor dezelfde RecordingSid binnen het venster -> 429, geen verwerking", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkOpnameStatus.mockResolvedValue(undefined);

    const uniekeRecordingSid = "RE-ratelimit-os-1";
    let laatsteResponse: Response | undefined;
    for (let i = 0; i < 21; i++) {
      laatsteResponse = await POST(maakRequest("42", uniekeRecordingSid));
    }

    expect(laatsteResponse!.status).toBe(429);
    expect(mockVerwerkOpnameStatus).toHaveBeenCalledTimes(20);
  });
});
