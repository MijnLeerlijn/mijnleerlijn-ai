import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { telnyxProvider } from "@/lib/trainers/telefonie/telnyx-provider";
import { verwerkInkomendeCall, verwerkTrainingKeuze, verwerkOpnameToets, verwerkOpnameAfgerond, verwerkOpnameStatus } from "@/lib/trainers/telefonie/gesprek";
import { maakOfHaalOproep } from "@/lib/trainers/telefonie/oproep-state";
import type { TelefonieProvider } from "@/lib/trainers/telefonie/provider";

// Traineromgeving V1, Ronde 3.5 vervolg (2026-08-25, providermigratie) —
// dekt uitsluitend de HTTP-/dispatchlaag van POST .../telefonie/webhook, DE
// ENE centrale Telnyx Call Control-webhookroute. Zelfde testfilosofie/
// -granulariteit als de uitgefaseerde 4 losse Twilio-routetestbestanden:
// gesprek.ts se orchestratiefuncties + oproep-state.ts se maakOfHaalOproep
// worden hier gemockt (hun eigen, uitgebreide dekking staat in
// gesprek.test.ts/oproep-state.test.ts, ONGEWIJZIGD gebleven door deze
// providermigratie) — dit bestand bewijst uitsluitend: signatuurverificatie,
// event_type-dispatch naar de juiste functie, rate limiting, en dat de route
// altijd 200 teruggeeft behalve bij een ongeldige signature.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/telefonie/telnyx-provider", () => ({ telnyxProvider: vi.fn() }));
vi.mock("@/lib/trainers/telefonie/gesprek", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/telefonie/gesprek")>();
  return { ...echt, verwerkInkomendeCall: vi.fn(), verwerkTrainingKeuze: vi.fn(), verwerkOpnameToets: vi.fn(), verwerkOpnameAfgerond: vi.fn(), verwerkOpnameStatus: vi.fn() };
});
vi.mock("@/lib/trainers/telefonie/oproep-state", () => ({ maakOfHaalOproep: vi.fn() }));

const mockTelnyxProvider = vi.mocked(telnyxProvider);
const mockVerwerkInkomendeCall = vi.mocked(verwerkInkomendeCall);
const mockVerwerkTrainingKeuze = vi.mocked(verwerkTrainingKeuze);
const mockVerwerkOpnameToets = vi.mocked(verwerkOpnameToets);
const mockVerwerkOpnameAfgerond = vi.mocked(verwerkOpnameAfgerond);
const mockVerwerkOpnameStatus = vi.mocked(verwerkOpnameStatus);
const mockMaakOfHaalOproep = vi.mocked(maakOfHaalOproep);

function maakFakeProvider(overrides: Partial<TelefonieProvider> = {}): TelefonieProvider {
  return {
    naam: "fake",
    verifieerWebhookSignature: vi.fn().mockReturnValue(true),
    ontleedInkomendeCall: vi.fn(),
    ontleedGatherResultaat: vi.fn(),
    ontleedOpnameStatus: vi.fn(),
    voerVoiceInstructiesUit: vi.fn().mockResolvedValue({ status: 200, contentType: null, body: null }),
    beantwoordOproep: vi.fn().mockResolvedValue(undefined),
    haalOpnameOp: vi.fn(),
    verwijderOpname: vi.fn(),
    ...overrides,
  };
}

function maakRequest(event: unknown, headers: Record<string, string> = { "telnyx-signature-ed25519": "sig", "telnyx-timestamp": "123" }) {
  return new NextRequest(new URL("https://trainers.mijnleerlijn.chat/api/trainers/telefonie/webhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(event),
  });
}

function callInitiated(overrides: Record<string, unknown> = {}) {
  return { data: { event_type: "call.initiated", payload: { call_control_id: "cc_1", from: "+31612345678", ...overrides } } };
}

beforeEach(() => {
  mockVerwerkInkomendeCall.mockReset().mockResolvedValue([]);
  mockVerwerkTrainingKeuze.mockReset().mockResolvedValue([]);
  mockVerwerkOpnameToets.mockReset().mockResolvedValue([]);
  mockVerwerkOpnameAfgerond.mockReset().mockReturnValue([{ soort: "zeg_en_ophangen", tekst: "Dank je." }]);
  mockVerwerkOpnameStatus.mockReset().mockResolvedValue(undefined);
  mockMaakOfHaalOproep.mockReset().mockResolvedValue({ id: 42, status: "opname_verwacht" } as never);
  mockTelnyxProvider.mockReset();
});

describe("POST /api/trainers/telefonie/webhook — signatuurverificatie (spec §17)", () => {
  it("ongeldige/ontbrekende signature -> 403, geen enkele dispatch", async () => {
    const provider = maakFakeProvider({ verifieerWebhookSignature: vi.fn().mockReturnValue(false) });
    mockTelnyxProvider.mockReturnValue(provider);

    const response = await POST(maakRequest(callInitiated()));

    expect(response.status).toBe(403);
    expect(provider.beantwoordOproep).not.toHaveBeenCalled();
    expect(mockVerwerkInkomendeCall).not.toHaveBeenCalled();
  });

  it("geeft de rauwe body-tekst (niet een her-geserialiseerde vorm) + de telnyx-headers door aan verifieerWebhookSignature", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    const event = callInitiated();

    await POST(maakRequest(event, { "telnyx-signature-ed25519": "sig-x", "telnyx-timestamp": "999" }));

    expect(provider.verifieerWebhookSignature).toHaveBeenCalledWith(
      expect.objectContaining({ signatureHeader: "sig-x", timestampHeader: "999", ruweBody: JSON.stringify(event) })
    );
  });
});

describe("POST /api/trainers/telefonie/webhook — event_type-dispatch", () => {
  it("call.initiated -> beantwoordOproep, GEEN verwerkInkomendeCall (spreken mag pas na call.answered)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);

    const response = await POST(maakRequest(callInitiated()));

    expect(response.status).toBe(200);
    expect(provider.beantwoordOproep).toHaveBeenCalledWith("cc_1");
    expect(mockVerwerkInkomendeCall).not.toHaveBeenCalled();
  });

  it("call.answered -> verwerkInkomendeCall aangeroepen, resultaat uitgevoerd via voerVoiceInstructiesUit", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    const instructies = [{ soort: "zeg_en_ophangen" as const, tekst: "Hallo." }];
    mockVerwerkInkomendeCall.mockResolvedValue(instructies);

    const response = await POST(maakRequest({ data: { event_type: "call.answered", payload: { call_control_id: "cc_1", from: "+31612345678" } } }));

    expect(response.status).toBe(200);
    expect(mockVerwerkInkomendeCall).toHaveBeenCalledTimes(1);
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", instructies);
  });

  it("call.gather.ended -> lost de oproepId op via maakOfHaalOproep en roept verwerkTrainingKeuze daarmee aan", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 77, status: "training_gekozen" } as never);
    const instructies = [{ soort: "zeg_en_ophangen" as const, tekst: "Ok." }];
    mockVerwerkTrainingKeuze.mockResolvedValue(instructies);

    await POST(maakRequest({ data: { event_type: "call.gather.ended", payload: { call_control_id: "cc_1", digits: "1" } } }));

    expect(mockMaakOfHaalOproep).toHaveBeenCalledWith(expect.anything(), "cc_1");
    expect(mockVerwerkTrainingKeuze).toHaveBeenCalledWith(expect.anything(), provider, 77, expect.objectContaining({ digits: "1" }));
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", instructies);
  });

  it("call.gather.ended MET gather_id='opname_toets' -> dispatcht naar verwerkOpnameToets, NIET verwerkTrainingKeuze (spec §9/§10)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_verwacht" } as never);
    const instructies = [{ soort: "stop_opname" as const, poging: 0 }, { soort: "zeg_en_ophangen" as const, tekst: "Bedankt." }];
    mockVerwerkOpnameToets.mockResolvedValue(instructies);

    await POST(maakRequest({ data: { event_type: "call.gather.ended", payload: { call_control_id: "cc_1", digits: "#", gather_id: "opname_toets" } } }));

    expect(mockVerwerkOpnameToets).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ digits: "#", gather_id: "opname_toets" }));
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", instructies);
  });

  it("call.gather.ended ZONDER gather_id='opname_toets' (de trainingkeuze-gather) -> dispatcht naar verwerkTrainingKeuze, NIET verwerkOpnameToets", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "trainer_herkend" } as never);

    await POST(maakRequest({ data: { event_type: "call.gather.ended", payload: { call_control_id: "cc_1", digits: "1" } } }));

    expect(mockVerwerkTrainingKeuze).toHaveBeenCalledTimes(1);
    expect(mockVerwerkOpnameToets).not.toHaveBeenCalled();
  });

  it("call.recording.saved -> verwerkOpnameStatus aangeroepen mét de opgeloste oproepId, daarna best-effort afsluitend bericht", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_ontvangen" } as never);

    await POST(maakRequest({ data: { event_type: "call.recording.saved", payload: { call_control_id: "cc_1", recording_id: "rec_1" } } }));

    expect(mockVerwerkOpnameStatus).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ recording_id: "rec_1" }));
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", [{ soort: "zeg_en_ophangen", tekst: "Dank je." }]);
  });

  it("call.recording.error -> ook doorgezet naar verwerkOpnameStatus (dezelfde functie handelt de mislukte status zelf af)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);

    await POST(maakRequest({ data: { event_type: "call.recording.error", payload: { call_control_id: "cc_1" } } }));

    expect(mockVerwerkOpnameStatus).toHaveBeenCalledTimes(1);
  });

  it("een dubbele/herhaalde call.recording.saved-webhook voor hetzelfde call_control_id lost STEEDS dezelfde oproepId op — de daadwerkelijke dedup (nooit een tweede concept) zit in de al-bewezen atomaire claim binnen verwerkOpnameStatus zelf (gesprek.test.ts scenario 11/24, ongewijzigd); dit bewijst dat de nieuwe dispatcher die aanroep bij een herhaling niet ontwijkt of met een ander oproepId aanroept", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 99, status: "opname_ontvangen" } as never);
    const event = { data: { event_type: "call.recording.saved", payload: { call_control_id: "cc_dup", recording_id: "rec_dup" } } };

    await POST(maakRequest(event));
    await POST(maakRequest(event)); // exacte herhaling — bv. Telnyx' eigen retrymechanisme

    expect(mockMaakOfHaalOproep).toHaveBeenCalledTimes(2);
    expect(mockMaakOfHaalOproep).toHaveBeenNthCalledWith(1, expect.anything(), "cc_dup");
    expect(mockMaakOfHaalOproep).toHaveBeenNthCalledWith(2, expect.anything(), "cc_dup");
    expect(mockVerwerkOpnameStatus).toHaveBeenNthCalledWith(1, expect.anything(), provider, 99, expect.anything());
    expect(mockVerwerkOpnameStatus).toHaveBeenNthCalledWith(2, expect.anything(), provider, 99, expect.anything());
  });

  it("een onbekend/niet-gebruikt event_type (bv. call.hangup) -> stil genegeerd, 200, geen enkele dispatch", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);

    const response = await POST(maakRequest({ data: { event_type: "call.hangup", payload: { call_control_id: "cc_1" } } }));

    expect(response.status).toBe(200);
    expect(provider.beantwoordOproep).not.toHaveBeenCalled();
    expect(mockVerwerkInkomendeCall).not.toHaveBeenCalled();
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
    expect(mockVerwerkOpnameStatus).not.toHaveBeenCalled();
  });

  it("lege/ontbrekende event_type of call_control_id -> 200, stil genegeerd", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);

    expect((await POST(maakRequest({ data: {} }))).status).toBe(200);
    expect((await POST(maakRequest({}))).status).toBe(200);
    expect(mockVerwerkInkomendeCall).not.toHaveBeenCalled();
  });
});

describe("POST /api/trainers/telefonie/webhook — nooit een onnodige fout richting Telnyx (spec §19)", () => {
  it("een onverwachte fout tijdens de dispatch wordt opgevangen -> alsnog 200 (voorkomt een onnodige Telnyx-retrystorm)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockVerwerkInkomendeCall.mockRejectedValue(new Error("onverwachte crash"));

    const response = await POST(maakRequest({ data: { event_type: "call.answered", payload: { call_control_id: "cc_1" } } }));
    expect(response.status).toBe(200);
  });

  it("rate limiting: de 21e call.initiated-aanvraag voor hetzelfde nummer binnen het venster wordt overgeslagen (toch 200, geen retrystorm)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    const uniekNummer = "+31600000001";

    let laatsteResponse: Response | undefined;
    for (let i = 0; i < 21; i++) {
      laatsteResponse = await POST(maakRequest(callInitiated({ from: uniekNummer, call_control_id: `cc_ratelimit_${i}` })));
    }

    expect(laatsteResponse!.status).toBe(200);
    expect(provider.beantwoordOproep).toHaveBeenCalledTimes(20);
  });
});
