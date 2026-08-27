import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { telnyxProvider } from "@/lib/trainers/telefonie/telnyx-provider";
import {
  verwerkInkomendeCall,
  verwerkTrainingKeuze,
  verwerkOpnameToets,
  verwerkSpreekAfgerond,
  verwerkOpnameAfgerond,
  verwerkOpnameStatus,
  verwerkVervolgKeuze,
  verwerkOnverwachteHangup,
} from "@/lib/trainers/telefonie/gesprek";
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
  return {
    ...echt,
    verwerkInkomendeCall: vi.fn(),
    verwerkTrainingKeuze: vi.fn(),
    verwerkOpnameToets: vi.fn(),
    verwerkSpreekAfgerond: vi.fn(),
    verwerkOpnameAfgerond: vi.fn(),
    verwerkOpnameStatus: vi.fn(),
    verwerkVervolgKeuze: vi.fn(),
    verwerkOnverwachteHangup: vi.fn(),
  };
});
vi.mock("@/lib/trainers/telefonie/oproep-state", () => ({ maakOfHaalOproep: vi.fn() }));

const mockTelnyxProvider = vi.mocked(telnyxProvider);
const mockVerwerkInkomendeCall = vi.mocked(verwerkInkomendeCall);
const mockVerwerkTrainingKeuze = vi.mocked(verwerkTrainingKeuze);
const mockVerwerkOpnameToets = vi.mocked(verwerkOpnameToets);
const mockVerwerkSpreekAfgerond = vi.mocked(verwerkSpreekAfgerond);
const mockVerwerkOpnameAfgerond = vi.mocked(verwerkOpnameAfgerond);
const mockVerwerkOpnameStatus = vi.mocked(verwerkOpnameStatus);
const mockVerwerkVervolgKeuze = vi.mocked(verwerkVervolgKeuze);
const mockVerwerkOnverwachteHangup = vi.mocked(verwerkOnverwachteHangup);
const mockMaakOfHaalOproep = vi.mocked(maakOfHaalOproep);

function maakFakeProvider(overrides: Partial<TelefonieProvider> = {}): TelefonieProvider {
  return {
    naam: "fake",
    verifieerWebhookSignature: vi.fn().mockReturnValue(true),
    ontleedInkomendeCall: vi.fn(),
    ontleedGatherResultaat: vi.fn(),
    ontleedOpnameStatus: vi.fn(),
    ontleedSpreekAfgerond: vi.fn(),
    ontleedHangup: vi.fn(),
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
  mockVerwerkSpreekAfgerond.mockReset().mockResolvedValue([]);
  mockVerwerkOpnameAfgerond.mockReset().mockResolvedValue([{ soort: "zeg_en_ophangen", tekst: "Dank je.", reden: "opname_afgerond" }]);
  mockVerwerkOpnameStatus.mockReset().mockResolvedValue([]);
  mockVerwerkVervolgKeuze.mockReset().mockResolvedValue([]);
  mockVerwerkOnverwachteHangup.mockReset().mockResolvedValue(undefined);
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
    const instructies = [{ soort: "zeg_en_ophangen" as const, tekst: "Hallo.", reden: "onbekend_nummer" }];
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
    const instructies = [{ soort: "zeg_en_ophangen" as const, tekst: "Ok.", reden: "geen_keuze_gemaakt" }];
    mockVerwerkTrainingKeuze.mockResolvedValue(instructies);

    await POST(maakRequest({ data: { event_type: "call.gather.ended", payload: { call_control_id: "cc_1", digits: "1" } } }));

    expect(mockMaakOfHaalOproep).toHaveBeenCalledWith(expect.anything(), "cc_1");
    expect(mockVerwerkTrainingKeuze).toHaveBeenCalledWith(expect.anything(), provider, 77, expect.objectContaining({ digits: "1" }));
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", instructies);
  });

  it("call.gather.ended met oproep.status='opname_verwacht' -> dispatcht naar verwerkOpnameToets, NIET verwerkTrainingKeuze (spec §9/§10) — GEEN gather_id in de payload (productieregressie-ronde 2026-08-27: Telnyx stuurt dit veld nooit terug, hard bevestigd tegen de officiële SDK-broncode; dispatch mag dus nooit van dit veld afhangen)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_verwacht" } as never);
    const instructies = [{ soort: "stop_opname" as const, poging: 0 }, { soort: "zeg_en_ophangen" as const, tekst: "Bedankt.", reden: "opname_afgerond" }];
    mockVerwerkOpnameToets.mockResolvedValue(instructies);

    await POST(maakRequest({ data: { event_type: "call.gather.ended", payload: { call_control_id: "cc_1", digits: "#" } } }));

    expect(mockVerwerkOpnameToets).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ digits: "#" }));
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", instructies);
  });

  it("call.gather.ended met oproep.status ANDERS DAN 'opname_verwacht' (de trainingkeuze-gather) -> dispatcht naar verwerkTrainingKeuze, NIET verwerkOpnameToets", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "trainer_herkend" } as never);

    await POST(maakRequest({ data: { event_type: "call.gather.ended", payload: { call_control_id: "cc_1", digits: "1" } } }));

    expect(mockVerwerkTrainingKeuze).toHaveBeenCalledTimes(1);
    expect(mockVerwerkOpnameToets).not.toHaveBeenCalled();
  });

  it("productieregressie-ronde (2026-08-27): een aanwezig gather_id-veld wordt genegeerd — dispatch hangt UITSLUITEND af van oproep.status, nooit van dit veld (root cause van de regressie was er juist blind op vertrouwen)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "trainer_herkend" } as never);

    // Zelfs als er (onverwacht) een gather_id="opname_toets" in de payload
    // zou zitten, mag dat de dispatch niet meer sturen zolang de oproep geen
    // opname verwacht.
    await POST(maakRequest({ data: { event_type: "call.gather.ended", payload: { call_control_id: "cc_1", digits: "1", gather_id: "opname_toets" } } }));

    expect(mockVerwerkTrainingKeuze).toHaveBeenCalledTimes(1);
    expect(mockVerwerkOpnameToets).not.toHaveBeenCalled();
  });

  // Live regressie-vervolgronde (2026-08-27/28, spec "dispatch op
  // call.gather.ended is live nog steeds niet voldoende") — call.dtmf.received
  // is nu de PRIMAIRE trigger voor verwerkOpnameToets tijdens een actieve
  // opname (call.gather.ended hierboven blijft fallback). Vervangt de
  // eerdere "uitsluitend diagnostiek, geen dispatch"-test uit de vorige
  // ronde: dat gedrag is bewust veranderd.
  it("testpunt 1/2: call.dtmf.received met oproep.status='opname_verwacht' -> dispatcht DIRECT naar verwerkOpnameToets (NIET verwerkTrainingKeuze), resultaat wordt uitgevoerd", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_verwacht" } as never);
    const instructies = [{ soort: "stop_opname" as const, poging: 0 }, { soort: "zeg_en_neem_op" as const, tekst: "Geen probleem...", actieUrl: "x", statusCallbackUrl: "y", stopToets: "#", herstartToets: "*", poging: 1 }];
    mockVerwerkOpnameToets.mockResolvedValue(instructies);

    const response = await POST(maakRequest({ data: { event_type: "call.dtmf.received", payload: { call_control_id: "cc_1", digit: "*" } } }));

    expect(response.status).toBe(200);
    expect(mockVerwerkOpnameToets).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ digit: "*" }));
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", instructies);
  });

  it("testpunt 5: digit '1' tijdens opname_verwacht -> dispatcht nog altijd (uitsluitend) naar verwerkOpnameToets, NOOIT naar verwerkTrainingKeuze — de route zelf beoordeelt het cijfer niet, dat doet verwerkOpnameToets", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_verwacht" } as never);
    mockVerwerkOpnameToets.mockResolvedValue([]); // verwerkOpnameToets zelf negeert cijfer "1" (zie gesprek.test.ts)

    await POST(maakRequest({ data: { event_type: "call.dtmf.received", payload: { call_control_id: "cc_1", digit: "1" } } }));

    expect(mockVerwerkOpnameToets).toHaveBeenCalledTimes(1);
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
  });

  it("testpunt 6: call.dtmf.received BUITEN opname_verwacht (bv. de trainingkeuze-gather) -> GEEN dispatch naar enige handler, geen voerVoiceInstructiesUit, toch 200 — trainingkeuze blijft uitsluitend via call.gather.ended lopen", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "trainer_herkend" } as never);

    const response = await POST(maakRequest({ data: { event_type: "call.dtmf.received", payload: { call_control_id: "cc_1", digit: "1" } } }));

    expect(response.status).toBe(200);
    expect(mockVerwerkOpnameToets).not.toHaveBeenCalled();
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
    expect(provider.voerVoiceInstructiesUit).not.toHaveBeenCalled();
  });

  it("testpunt 7: '*'/'#' via call.dtmf.received BUITEN opname_verwacht -> ook dan geen actie", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "concept_klaar" } as never);

    await POST(maakRequest({ data: { event_type: "call.dtmf.received", payload: { call_control_id: "cc_1", digit: "*" } } }));
    await POST(maakRequest({ data: { event_type: "call.dtmf.received", payload: { call_control_id: "cc_1", digit: "#" } } }));

    expect(mockVerwerkOpnameToets).not.toHaveBeenCalled();
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
  });

  it("testpunt 3/4: call.dtmf.received gevolgd door call.gather.ended voor dezelfde toetsdruk -> BEIDE dispatchen naar verwerkOpnameToets (de dedup zelf loopt in verwerkOpnameToets se eigen claim, niet in de dispatchlaag — zie gesprek.test.ts)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_verwacht" } as never);
    mockVerwerkOpnameToets.mockResolvedValueOnce([{ soort: "stop_opname", poging: 0 }]).mockResolvedValueOnce([]); // 2e aanroep: duplicaat, claim verloren -> []

    await POST(maakRequest({ data: { event_type: "call.dtmf.received", payload: { call_control_id: "cc_1", digit: "#" } } }));
    await POST(maakRequest({ data: { event_type: "call.gather.ended", payload: { call_control_id: "cc_1", digits: "#" } } }));

    expect(mockVerwerkOpnameToets).toHaveBeenCalledTimes(2);
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
  });

  it("call.speak.ended -> dispatcht naar verwerkSpreekAfgerond met de opgeloste oproepId (spec: deterministische speak->opname-sequencing)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_verwacht" } as never);
    const instructies = [{ soort: "opname_starten" as const, maxDuurSeconden: 1200, stilteTimeoutSeconden: 60, stopToets: "#", herstartToets: "*", poging: 0 }];
    mockVerwerkSpreekAfgerond.mockResolvedValue(instructies);

    await POST(maakRequest({ data: { event_type: "call.speak.ended", payload: { call_control_id: "cc_1", client_state: "c3RhcnRfb3BuYW1lOjA=" } } }));

    expect(mockVerwerkSpreekAfgerond).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ client_state: "c3RhcnRfb3BuYW1lOjA=" }));
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", instructies);
  });

  it("call.recording.saved -> verwerkOpnameStatus aangeroepen mét de opgeloste oproepId, en DIENS EIGEN teruggegeven instructies rechtstreeks uitgevoerd (root-cause-fix 2026-08-27, spec-eis §6 — geen aparte altijd-uitgevoerde verwerkOpnameAfgerond hier meer, die zou een automatische stop alsnog ten onrechte laten ophangen)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_ontvangen" } as never);
    const instructies = [{ soort: "zeg_en_ophangen" as const, tekst: "Bedankt.", reden: "opname_afgerond" as const }];
    mockVerwerkOpnameStatus.mockResolvedValue(instructies);

    await POST(maakRequest({ data: { event_type: "call.recording.saved", payload: { call_control_id: "cc_1", recording_id: "rec_1" } } }));

    expect(mockVerwerkOpnameStatus).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ recording_id: "rec_1" }));
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", instructies);
    expect(mockVerwerkOpnameAfgerond).not.toHaveBeenCalled(); // uitsluitend nog aangeroepen VANUIT gesprek.ts zelf, nooit meer los door de route
  });

  it("call.recording.saved met een automatische (stilte-)stop -> verwerkOpnameStatus se vervolgkeuze-prompt wordt uitgevoerd, GEEN ophangen (spec-eis §6, hier op dispatchniveau: de route voert blind uit wat verwerkOpnameStatus teruggeeft)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_ontvangen" } as never);
    const vervolgkeuzePrompt = [
      {
        soort: "zeg_en_kies_cijfers" as const,
        tekst: "Ik heb een tijdje niets meer gehoord. Wil je verder inspreken? Druk dan op het sterretje. Ben je klaar met je verslag? Druk dan op het hekje.",
        actieUrl: "/api/trainers/telefonie/webhook/vervolgkeuze?oproepId=42",
        maxCijfers: 1,
        timeoutSeconden: 30,
        geldigeCijfers: "*#",
      },
    ];
    mockVerwerkOpnameStatus.mockResolvedValue(vervolgkeuzePrompt);

    await POST(maakRequest({ data: { event_type: "call.recording.saved", payload: { call_control_id: "cc_1", recording_id: "rec_1" } } }));

    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_1", vervolgkeuzePrompt);
    expect(provider.voerVoiceInstructiesUit).not.toHaveBeenCalledWith("cc_1", expect.arrayContaining([expect.objectContaining({ soort: "zeg_en_ophangen" })]));
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

  it("een onbekend/niet-gebruikt event_type (bv. call.speak.started) -> stil genegeerd, 200, geen enkele dispatch", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);

    const response = await POST(maakRequest({ data: { event_type: "call.speak.started", payload: { call_control_id: "cc_1" } } }));

    expect(response.status).toBe(200);
    expect(provider.beantwoordOproep).not.toHaveBeenCalled();
    expect(mockVerwerkInkomendeCall).not.toHaveBeenCalled();
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
    expect(mockVerwerkOpnameStatus).not.toHaveBeenCalled();
  });

  // Root-cause-fix productie-incident (2026-08-27, spec-eis §8) — call.hangup
  // is sinds deze ronde GEEN onbekend/genegeerd event meer: het moet ALTIJD
  // hangup_cause/hangup_source vastleggen en, waar nog relevant, best-effort
  // afronden met wat er al verzameld is (verwerkOnverwachteHangup zelf, met
  // de echte gesprek.ts-logica, is al gedekt in gesprek.test.ts) — dit
  // bestand bewijst uitsluitend de dispatch zelf.
  it("call.hangup -> dispatcht naar verwerkOnverwachteHangup met de opgeloste oproepId, GEEN voice-instructies (de verbinding is al weg) en GEEN rate limit", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_onderbroken" } as never);

    const response = await POST(maakRequest({ data: { event_type: "call.hangup", payload: { call_control_id: "cc_hangup_1", hangup_cause: "normal_clearing", hangup_source: "callee" } } }));

    expect(response.status).toBe(200);
    expect(mockVerwerkOnverwachteHangup).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ hangup_cause: "normal_clearing", hangup_source: "callee" }));
    expect(provider.voerVoiceInstructiesUit).not.toHaveBeenCalled();
  });

  // Unieke call_control_id ("cc_hangup_ratelimit") — beperkPerGesprek is een
  // module-scoped teller die niet ververst tussen tests in dit bestand; dit
  // scenario verbruikt hier zelf al 20 aanvragen voor DIT gesprek, dus een
  // gedeeld id met andere tests zou hun eigen rate-limitbudget besmetten.
  it("call.hangup blijft verwerkt ook ná 20 eerdere events voor hetzelfde gesprek — geen rate limit op dit event (spec-eis §8: moet altijd hangup_cause/hangup_source kunnen vastleggen)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_onderbroken" } as never);

    for (let i = 0; i < 20; i++) {
      await POST(maakRequest({ data: { event_type: "call.dtmf.received", payload: { call_control_id: "cc_hangup_ratelimit", digit: "1" } } }));
    }
    await POST(maakRequest({ data: { event_type: "call.hangup", payload: { call_control_id: "cc_hangup_ratelimit" } } }));

    expect(mockVerwerkOnverwachteHangup).toHaveBeenCalledTimes(1);
  });

  it("call.gather.ended met oproep.status='opname_onderbroken' -> dispatcht naar verwerkVervolgKeuze (root-cause-fix 2026-08-27, spec-eis §6 — de vervolgkeuze-prompt ná een automatische stilte-stop)", async () => {
    const provider = maakFakeProvider();
    mockTelnyxProvider.mockReturnValue(provider);
    mockMaakOfHaalOproep.mockResolvedValue({ id: 42, status: "opname_onderbroken" } as never);
    const instructies = [{ soort: "opname_starten" as const, maxDuurSeconden: 1200, stilteTimeoutSeconden: 60, stopToets: "#", herstartToets: "*", poging: 1 }];
    mockVerwerkVervolgKeuze.mockResolvedValue(instructies);

    await POST(maakRequest({ data: { event_type: "call.gather.ended", payload: { call_control_id: "cc_vervolgkeuze", digits: "*" } } }));

    expect(mockVerwerkVervolgKeuze).toHaveBeenCalledWith(expect.anything(), provider, 42, expect.objectContaining({ digits: "*" }));
    expect(mockVerwerkOpnameToets).not.toHaveBeenCalled();
    expect(mockVerwerkTrainingKeuze).not.toHaveBeenCalled();
    expect(provider.voerVoiceInstructiesUit).toHaveBeenCalledWith("cc_vervolgkeuze", instructies);
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
