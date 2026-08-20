import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import twilio from "twilio";
import { twilioProvider } from "./twilio-provider";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — dekt lib/trainers/telefonie/
// twilio-provider.ts, de enige plek waar Twilio-specifieke concepten mogen
// voorkomen (spec §16). verifieerWebhookSignature draait tegen ECHTE
// HMAC-SHA1-berekening (twilio.getExpectedTwilioSignature is een zuivere,
// synchrone cryptofunctie — geen netwerk nodig), geen mock: dit IS de
// beveiligingsgrens uit spec §17, dus dit bewijst het daadwerkelijke
// verificatiegedrag. haalOpnameOp/verwijderOpname doen wél echte
// netwerkaanroepen (fetch resp. de Twilio REST-client) — in deze sandbox
// zonder uitgaand netwerk naar api.twilio.com dus alleen haalOpnameOp hier
// getest (via een gemockte global fetch); verwijderOpname se ROL in de
// orchestratie (best-effort, in een finally, fouten nooit doorgegooid) wordt
// gedekt in gesprek.test.ts via een fake TelefonieProvider — zie het
// opleverrapport se beperkingen-sectie.

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest0000000000000000000000000");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "test-auth-token-12345");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const URL = "https://trainers.mijnleerlijn.nl/api/trainers/telefonie/inbound";

describe("verifieerWebhookSignature (spec §17)", () => {
  it("een echte, correct berekende signature over exact deze URL+velden -> true", () => {
    const vormVelden = { CallSid: "CA123", From: "+31612345678", To: "+31201234567" };
    const signature = twilio.getExpectedTwilioSignature("test-auth-token-12345", URL, vormVelden);
    expect(twilioProvider().verifieerWebhookSignature({ url: URL, signatureHeader: signature, vormVelden })).toBe(true);
  });

  it("ontbrekende signature-header -> false, nooit verwerken op basis van alleen URL-kennis", () => {
    const vormVelden = { CallSid: "CA123" };
    expect(twilioProvider().verifieerWebhookSignature({ url: URL, signatureHeader: null, vormVelden })).toBe(false);
  });

  it("een willekeurige/verzonnen signature -> false", () => {
    const vormVelden = { CallSid: "CA123" };
    expect(twilioProvider().verifieerWebhookSignature({ url: URL, signatureHeader: "totaal-verzonnen-waarde", vormVelden })).toBe(false);
  });

  it("een geldige signature over ANDERE vormvelden dan wat daadwerkelijk binnenkwam (getamperd formulier) -> false", () => {
    const signature = twilio.getExpectedTwilioSignature("test-auth-token-12345", URL, { CallSid: "CA123", From: "+31612345678" });
    const getamperdeVelden = { CallSid: "CA123", From: "+31699999999" };
    expect(twilioProvider().verifieerWebhookSignature({ url: URL, signatureHeader: signature, vormVelden: getamperdeVelden })).toBe(false);
  });

  it("een geldige signature over een ANDERE URL (bv. verkeerd gereconstrueerde externe URL) -> false", () => {
    const vormVelden = { CallSid: "CA123" };
    const signature = twilio.getExpectedTwilioSignature("test-auth-token-12345", "https://andere-host.example/pad", vormVelden);
    expect(twilioProvider().verifieerWebhookSignature({ url: URL, signatureHeader: signature, vormVelden })).toBe(false);
  });

  it("een signature berekend met het VERKEERDE auth-token -> false (een aanvaller die de URL kent maar niet het token)", () => {
    const vormVelden = { CallSid: "CA123" };
    const signature = twilio.getExpectedTwilioSignature("een-ander-token", URL, vormVelden);
    expect(twilioProvider().verifieerWebhookSignature({ url: URL, signatureHeader: signature, vormVelden })).toBe(false);
  });
});

describe("ontleedInkomendeCall (spec §4: verborgen/anoniem nummer)", () => {
  it("een normaal zichtbaar nummer -> providerCallId/vanNummerRuw gevuld, nummerVerborgen false", () => {
    const { providerCallId, vanNummerRuw, nummerVerborgen } = twilioProvider().ontleedInkomendeCall({ CallSid: "CA123", From: "+31612345678" });
    expect(providerCallId).toBe("CA123");
    expect(vanNummerRuw).toBe("+31612345678");
    expect(nummerVerborgen).toBe(false);
  });

  it.each(["anonymous", "restricted", "unavailable", "private", "ANONYMOUS", "Restricted"])("From=%s wordt herkend als verborgen nummer, vanNummerRuw is null", (van) => {
    const { vanNummerRuw, nummerVerborgen } = twilioProvider().ontleedInkomendeCall({ CallSid: "CA123", From: van });
    expect(nummerVerborgen).toBe(true);
    expect(vanNummerRuw).toBeNull();
  });

  it("ontbrekend From-veld -> ook als verborgen behandeld, nooit als leeg-maar-geldig nummer", () => {
    const { vanNummerRuw, nummerVerborgen } = twilioProvider().ontleedInkomendeCall({ CallSid: "CA123" });
    expect(nummerVerborgen).toBe(true);
    expect(vanNummerRuw).toBeNull();
  });

  it("ontbrekend CallSid -> lege providerCallId (nooit undefined/crash), de aanroeper wijst dit structureel af", () => {
    expect(twilioProvider().ontleedInkomendeCall({ From: "+31612345678" }).providerCallId).toBe("");
  });
});

describe("ontleedGatherResultaat", () => {
  it("Digits met inhoud -> cijfers gevuld", () => {
    expect(twilioProvider().ontleedGatherResultaat({ Digits: "1" })).toEqual({ cijfers: "1" });
  });

  it("lege/ontbrekende Digits (timeout, geen invoer) -> cijfers null", () => {
    expect(twilioProvider().ontleedGatherResultaat({ Digits: "" })).toEqual({ cijfers: null });
    expect(twilioProvider().ontleedGatherResultaat({})).toEqual({ cijfers: null });
  });
});

describe("ontleedOpnameStatus", () => {
  it("RecordingStatus=completed -> voltooid, ophaalReferentie=RecordingUrl, duur geparsed", () => {
    const uitkomst = twilioProvider().ontleedOpnameStatus({
      CallSid: "CA123",
      RecordingSid: "RE1",
      RecordingStatus: "completed",
      RecordingUrl: "https://api.twilio.com/recordings/RE1",
      RecordingDuration: "95",
    });
    expect(uitkomst).toEqual({
      providerCallId: "CA123",
      providerRecordingId: "RE1",
      status: "voltooid",
      duurSeconden: 95,
      ophaalReferentie: "https://api.twilio.com/recordings/RE1",
    });
  });

  it.each(["failed", "absent", "in-progress", undefined])("RecordingStatus=%s -> mislukt, GEEN ophaalReferentie ook al is RecordingUrl toevallig aanwezig", (status) => {
    const vormVelden: Record<string, string> = { CallSid: "CA123", RecordingSid: "RE1", RecordingUrl: "https://api.twilio.com/recordings/RE1" };
    if (status !== undefined) vormVelden.RecordingStatus = status;
    const uitkomst = twilioProvider().ontleedOpnameStatus(vormVelden);
    expect(uitkomst.status).toBe("mislukt");
    expect(uitkomst.ophaalReferentie).toBeNull();
  });

  it("ontbrekende/onparseerbare RecordingDuration -> duurSeconden null, gooit nooit", () => {
    expect(twilioProvider().ontleedOpnameStatus({ RecordingStatus: "completed" }).duurSeconden).toBeNull();
    expect(twilioProvider().ontleedOpnameStatus({ RecordingStatus: "completed", RecordingDuration: "niet-een-getal" }).duurSeconden).toBeNull();
  });
});

describe("bouwVoiceResponse", () => {
  it("zeg_en_ophangen -> geldige TwiML met Say en Hangup", () => {
    const xml = twilioProvider().bouwVoiceResponse([{ soort: "zeg_en_ophangen", tekst: "Tot ziens." }]);
    expect(xml).toContain("<Say");
    expect(xml).toContain("Tot ziens.");
    expect(xml).toContain("<Hangup");
  });

  it("zeg_en_kies_cijfers -> Gather met de opgegeven actie-URL en cijferaantal", () => {
    const xml = twilioProvider().bouwVoiceResponse([
      { soort: "zeg_en_kies_cijfers", tekst: "Kies een optie.", actieUrl: "https://trainers.mijnleerlijn.nl/api/x?oproepId=1", maxCijfers: 1, timeoutSeconden: 8 },
    ]);
    expect(xml).toContain("<Gather");
    expect(xml).toContain("numDigits=\"1\"");
    expect(xml).toContain("oproepId=1");
  });

  it("zeg_en_neem_op -> Record met maxLength/finishOnKey/recordingStatusCallback, transcribe=false (spec §11: eigen OpenAI-infra, nooit Twilio's eigen transcriptiedienst)", () => {
    const xml = twilioProvider().bouwVoiceResponse([
      {
        soort: "zeg_en_neem_op",
        tekst: "Vertel je verslag.",
        actieUrl: "https://trainers.mijnleerlijn.nl/api/opname-afgerond?oproepId=1",
        statusCallbackUrl: "https://trainers.mijnleerlijn.nl/api/opname-status?oproepId=1",
        maxDuurSeconden: 900,
        stilteTimeoutSeconden: 5,
        stopToets: "#",
      },
    ]);
    expect(xml).toContain("<Record");
    expect(xml).toContain("maxLength=\"900\"");
    expect(xml).toContain("finishOnKey=\"#\"");
    expect(xml).toContain("transcribe=\"false\"");
    expect(xml).toContain("opname-status");
  });
});

describe("haalOpnameOp (spec §9: provider-geauthenticeerde download, geen publieke URL)", () => {
  it("haalt op via Basic Auth met accountSid:authToken, altijd de .mp3-vorm", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal("fetch", fetchMock);

    await twilioProvider().haalOpnameOp("https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1.mp3");
    const verwachteAuth = `Basic ${Buffer.from("ACtest0000000000000000000000000:test-auth-token-12345").toString("base64")}`;
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(verwachteAuth);
  });

  it("een niet-ok HTTP-status -> gooit (aanroeper markeert dit als transcriptie_mislukt)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(twilioProvider().haalOpnameOp("https://api.twilio.com/recordings/RE1")).rejects.toThrow();
  });
});
