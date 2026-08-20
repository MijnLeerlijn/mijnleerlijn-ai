import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { twilioProvider } from "@/lib/trainers/telefonie/twilio-provider";
import { verwerkOpnameAfgerond } from "@/lib/trainers/telefonie/gesprek";
import type { TelefonieProvider } from "@/lib/trainers/telefonie/provider";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — dekt uitsluitend de HTTP-laag
// van POST .../telefonie/opname-afgerond (<Record>'s eigen action-URL — geen
// payload/DB hier, verwerkOpnameAfgerond is synchroon en stateloos).
vi.mock("@/lib/trainers/telefonie/twilio-provider", () => ({ twilioProvider: vi.fn() }));
vi.mock("@/lib/trainers/telefonie/gesprek", () => ({ verwerkOpnameAfgerond: vi.fn() }));

const mockTwilioProvider = vi.mocked(twilioProvider);
const mockVerwerkOpnameAfgerond = vi.mocked(verwerkOpnameAfgerond);

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

function maakRequest() {
  return new NextRequest("https://trainers.mijnleerlijn.nl/api/trainers/telefonie/opname-afgerond?oproepId=42", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": "sig" },
    body: new URLSearchParams({ CallSid: "CA1" }).toString(),
  });
}

beforeEach(() => {
  mockVerwerkOpnameAfgerond.mockReset();
});

describe("POST /api/trainers/telefonie/opname-afgerond", () => {
  it("geldige signature -> 200 text/xml met de vaste afsluitende boodschap", async () => {
    const provider = maakFakeProvider();
    mockTwilioProvider.mockReturnValue(provider);
    mockVerwerkOpnameAfgerond.mockReturnValue([{ soort: "zeg_en_ophangen", tekst: "Dank je." }]);

    const response = await POST(maakRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/xml");
    expect(provider.bouwVoiceResponse).toHaveBeenCalledWith([{ soort: "zeg_en_ophangen", tekst: "Dank je." }]);
  });

  it("scenario 12: ontbrekende/ongeldige signature -> 403, verwerkOpnameAfgerond nooit aangeroepen", async () => {
    const provider = maakFakeProvider({ verifieerWebhookSignature: vi.fn().mockReturnValue(false) });
    mockTwilioProvider.mockReturnValue(provider);

    const response = await POST(maakRequest());

    expect(response.status).toBe(403);
    expect(mockVerwerkOpnameAfgerond).not.toHaveBeenCalled();
  });
});
