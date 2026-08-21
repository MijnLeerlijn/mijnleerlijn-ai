import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from "node:crypto";
import { telnyxProvider } from "./telnyx-provider";

// Traineromgeving V1, Ronde 3.5 vervolg (2026-08-25, providermigratie) —
// dekt lib/trainers/telefonie/telnyx-provider.ts, de enige plek waar
// Telnyx-specifieke concepten mogen voorkomen (spec §16). Zelfde
// testfilosofie als het uitgefaseerde twilio-provider.test.ts:
// verifieerWebhookSignature draait tegen ECHTE Ed25519-cryptografie (geen
// mock — dit IS de beveiligingsgrens uit spec §17), voerVoiceInstructiesUit/
// haalOpnameOp/verwijderOpname/beantwoordOproep/stopOpname doen wél echte
// netwerkaanroepen (fetch) — in deze sandbox zonder uitgaand netwerk naar
// api.telnyx.com dus hier getest via een gemockte global fetch.

function maakEchtSleutelpaar(): { ruwePublicKeyBase64: string; privateKey: KeyObject } {
  const { publicKey, privateKey }: { publicKey: KeyObject; privateKey: KeyObject } = generateKeyPairSync("ed25519");
  const spkiDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  // De eerste 12 bytes zijn de vaste ASN.1/SPKI-header (zie
  // telnyx-provider.ts se telnyxPublicKeyObject) — TELNYX_PUBLIC_KEY bevat
  // uitsluitend de rauwe 32-byte sleutel zelf, exact zoals de Telnyx Console
  // 'm toont.
  const ruwePublicKey = spkiDer.subarray(12);
  return { ruwePublicKeyBase64: ruwePublicKey.toString("base64"), privateKey };
}

function ondertekenBericht(privateKey: KeyObject, timestamp: string, body: string): string {
  return cryptoSign(null, Buffer.from(`${timestamp}|${body}`, "utf8"), privateKey).toString("base64");
}

beforeEach(() => {
  vi.stubEnv("TELNYX_API_KEY", "test-telnyx-api-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("verifieerWebhookSignature (spec §17, Ed25519 over {timestamp}|{rauwe body})", () => {
  it("een echte, correct berekende Ed25519-signature -> true", () => {
    const { ruwePublicKeyBase64, privateKey } = maakEchtSleutelpaar();
    vi.stubEnv("TELNYX_PUBLIC_KEY", ruwePublicKeyBase64);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ data: { event_type: "call.initiated" } });
    const signature = ondertekenBericht(privateKey, timestamp, body);

    expect(
      telnyxProvider().verifieerWebhookSignature({ url: "https://ongebruikt.example", vormVelden: {}, signatureHeader: signature, timestampHeader: timestamp, ruweBody: body })
    ).toBe(true);
  });

  it("ontbrekende signature-header -> false, nooit verwerken op basis van alleen de body", () => {
    vi.stubEnv("TELNYX_PUBLIC_KEY", maakEchtSleutelpaar().ruwePublicKeyBase64);
    expect(
      telnyxProvider().verifieerWebhookSignature({ url: "https://x", vormVelden: {}, signatureHeader: null, timestampHeader: String(Math.floor(Date.now() / 1000)), ruweBody: "{}" })
    ).toBe(false);
  });

  it("ontbrekende timestamp-header -> false", () => {
    vi.stubEnv("TELNYX_PUBLIC_KEY", maakEchtSleutelpaar().ruwePublicKeyBase64);
    expect(telnyxProvider().verifieerWebhookSignature({ url: "https://x", vormVelden: {}, signatureHeader: "verzonnen", timestampHeader: null, ruweBody: "{}" })).toBe(false);
  });

  it("een willekeurige/verzonnen signature -> false", () => {
    vi.stubEnv("TELNYX_PUBLIC_KEY", maakEchtSleutelpaar().ruwePublicKeyBase64);
    expect(
      telnyxProvider().verifieerWebhookSignature({
        url: "https://x",
        vormVelden: {},
        signatureHeader: Buffer.from("totaal-verzonnen").toString("base64"),
        timestampHeader: String(Math.floor(Date.now() / 1000)),
        ruweBody: "{}",
      })
    ).toBe(false);
  });

  it("een geldige signature over een GETAMPERDE body -> false", () => {
    const { ruwePublicKeyBase64, privateKey } = maakEchtSleutelpaar();
    vi.stubEnv("TELNYX_PUBLIC_KEY", ruwePublicKeyBase64);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = ondertekenBericht(privateKey, timestamp, JSON.stringify({ data: { event_type: "call.initiated" } }));

    expect(
      telnyxProvider().verifieerWebhookSignature({
        url: "https://x",
        vormVelden: {},
        signatureHeader: signature,
        timestampHeader: timestamp,
        ruweBody: JSON.stringify({ data: { event_type: "call.hangup" } }), // getamperd
      })
    ).toBe(false);
  });

  it("een signature ondertekend met het VERKEERDE privésleutel (verkeerde publieke sleutel geconfigureerd) -> false", () => {
    const eigenPaar = maakEchtSleutelpaar();
    const anderPaar = maakEchtSleutelpaar();
    vi.stubEnv("TELNYX_PUBLIC_KEY", eigenPaar.ruwePublicKeyBase64);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = "{}";
    const signature = ondertekenBericht(anderPaar.privateKey, timestamp, body); // ondertekend met een ANDER keypair

    expect(telnyxProvider().verifieerWebhookSignature({ url: "https://x", vormVelden: {}, signatureHeader: signature, timestampHeader: timestamp, ruweBody: body })).toBe(false);
  });

  it("een te oude timestamp (buiten de replaytolerantie) -> false, ook al is de signature verder geldig", () => {
    const { ruwePublicKeyBase64, privateKey } = maakEchtSleutelpaar();
    vi.stubEnv("TELNYX_PUBLIC_KEY", ruwePublicKeyBase64);
    const oudeTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 minuten geleden, > 5 min tolerantie
    const body = "{}";
    const signature = ondertekenBericht(privateKey, oudeTimestamp, body);

    expect(telnyxProvider().verifieerWebhookSignature({ url: "https://x", vormVelden: {}, signatureHeader: signature, timestampHeader: oudeTimestamp, ruweBody: body })).toBe(false);
  });

  it("een ontparseerbare timestamp -> false, gooit nooit", () => {
    vi.stubEnv("TELNYX_PUBLIC_KEY", maakEchtSleutelpaar().ruwePublicKeyBase64);
    expect(() =>
      telnyxProvider().verifieerWebhookSignature({ url: "https://x", vormVelden: {}, signatureHeader: "iets", timestampHeader: "niet-een-getal", ruweBody: "{}" })
    ).not.toThrow();
    expect(telnyxProvider().verifieerWebhookSignature({ url: "https://x", vormVelden: {}, signatureHeader: "iets", timestampHeader: "niet-een-getal", ruweBody: "{}" })).toBe(false);
  });
});

describe("ontleedInkomendeCall (spec §4: verborgen/anoniem nummer)", () => {
  it("een normaal zichtbaar nummer -> providerCallId/vanNummerRuw gevuld, nummerVerborgen false", () => {
    const { providerCallId, vanNummerRuw, nummerVerborgen } = telnyxProvider().ontleedInkomendeCall({ call_control_id: "v3:abc", from: "+31612345678" });
    expect(providerCallId).toBe("v3:abc");
    expect(vanNummerRuw).toBe("+31612345678");
    expect(nummerVerborgen).toBe(false);
  });

  it.each(["anonymous", "restricted", "unavailable", "private", "ANONYMOUS", "Restricted"])("from=%s wordt herkend als verborgen nummer, vanNummerRuw is null", (van) => {
    const { vanNummerRuw, nummerVerborgen } = telnyxProvider().ontleedInkomendeCall({ call_control_id: "v3:abc", from: van });
    expect(nummerVerborgen).toBe(true);
    expect(vanNummerRuw).toBeNull();
  });

  it("ontbrekend from-veld -> ook als verborgen behandeld, nooit als leeg-maar-geldig nummer", () => {
    const { vanNummerRuw, nummerVerborgen } = telnyxProvider().ontleedInkomendeCall({ call_control_id: "v3:abc" });
    expect(nummerVerborgen).toBe(true);
    expect(vanNummerRuw).toBeNull();
  });

  it("ontbrekend call_control_id -> lege providerCallId (nooit undefined/crash)", () => {
    expect(telnyxProvider().ontleedInkomendeCall({ from: "+31612345678" }).providerCallId).toBe("");
  });
});

describe("ontleedGatherResultaat", () => {
  it("digits met inhoud -> cijfers gevuld", () => {
    expect(telnyxProvider().ontleedGatherResultaat({ digits: "1" })).toEqual({ cijfers: "1" });
  });

  it("lege/ontbrekende digits (timeout, geen invoer) -> cijfers null", () => {
    expect(telnyxProvider().ontleedGatherResultaat({ digits: "" })).toEqual({ cijfers: null });
    expect(telnyxProvider().ontleedGatherResultaat({})).toEqual({ cijfers: null });
  });
});

describe("ontleedOpnameStatus", () => {
  it("event_type=call.recording.saved -> voltooid, ophaalReferentie=recording_id, duur berekend uit start/eind", () => {
    const uitkomst = telnyxProvider().ontleedOpnameStatus({
      event_type: "call.recording.saved",
      call_control_id: "v3:abc",
      recording_id: "rec_1",
      recording_started_at: "2026-08-25T10:00:00.000Z",
      recording_ended_at: "2026-08-25T10:01:35.000Z",
    });
    expect(uitkomst).toEqual({
      providerCallId: "v3:abc",
      providerRecordingId: "rec_1",
      status: "voltooid",
      duurSeconden: 95,
      ophaalReferentie: "rec_1",
    });
  });

  it.each(["call.recording.error", "call.hangup", "iets_onbekends"])("event_type=%s -> mislukt, GEEN ophaalReferentie ook al is recording_id toevallig aanwezig", (eventType) => {
    const uitkomst = telnyxProvider().ontleedOpnameStatus({ event_type: eventType, call_control_id: "v3:abc", recording_id: "rec_1" });
    expect(uitkomst.status).toBe("mislukt");
    expect(uitkomst.ophaalReferentie).toBeNull();
  });

  it("ontbrekende/onparseerbare start-/eindtijden -> duurSeconden null, gooit nooit", () => {
    expect(telnyxProvider().ontleedOpnameStatus({ event_type: "call.recording.saved" }).duurSeconden).toBeNull();
    expect(
      telnyxProvider().ontleedOpnameStatus({ event_type: "call.recording.saved", recording_started_at: "niet-een-datum", recording_ended_at: "ook-niet" }).duurSeconden
    ).toBeNull();
  });
});

describe("voerVoiceInstructiesUit (Call Control-commando's — spec §16: uitsluitend hier Telnyx-specifiek)", () => {
  it("zeg_en_ophangen -> speak gevolgd door hangup, correcte URL's/body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const respons = await telnyxProvider().voerVoiceInstructiesUit("cc_1", [{ soort: "zeg_en_ophangen", tekst: "Tot ziens." }]);

    expect(respons).toEqual({ status: 200, contentType: null, body: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [speakUrl, speakInit] = fetchMock.mock.calls[0]!;
    expect(speakUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/speak");
    expect((speakInit as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer test-telnyx-api-key");
    expect(JSON.parse((speakInit as { body: string }).body)).toMatchObject({ payload: "Tot ziens." });
    const [hangupUrl] = fetchMock.mock.calls[1]!;
    expect(hangupUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/hangup");
  });

  it("zeg_en_kies_cijfers -> gather_using_speak met de opgegeven tekst/cijferaantal/timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [
      { soort: "zeg_en_kies_cijfers", tekst: "Kies een optie.", actieUrl: "https://ongebruikt.example", maxCijfers: 1, timeoutSeconden: 8 },
    ]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/gather_using_speak");
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toMatchObject({ payload: "Kies een optie.", max_digits: 1, min_digits: 1, inter_digit_timeout_millis: 8000 });
  });

  it("zeg_en_neem_op -> record_start met max_length/timeout_secs uit de instructie", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [
      {
        soort: "zeg_en_neem_op",
        tekst: "Vertel je verslag.",
        actieUrl: "https://ongebruikt.example",
        statusCallbackUrl: "https://ongebruikt.example",
        maxDuurSeconden: 900,
        stilteTimeoutSeconden: 5,
        stopToets: "#",
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/record_start");
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toMatchObject({ format: "mp3", channels: "single", max_length: 900, timeout_secs: 5 });
  });

  it("meerdere instructies worden na elkaar uitgevoerd, in volgorde", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [
      { soort: "zeg_en_ophangen", tekst: "Eén." },
      { soort: "zeg_en_ophangen", tekst: "Twee." },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(4); // 2x (speak+hangup)
  });

  it("een falend commando wordt intern gevangen — voerVoiceInstructiesUit gooit NOOIT door (spec: nooit een onnodige 5xx/crash op de webhookhandler)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));

    await expect(telnyxProvider().voerVoiceInstructiesUit("cc_1", [{ soort: "zeg_en_ophangen", tekst: "Tot ziens." }])).resolves.toEqual({
      status: 200,
      contentType: null,
      body: null,
    });
  });
});

describe("beantwoordOproep / stopOpname", () => {
  it("beantwoordOproep -> POST .../actions/answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await telnyxProvider().beantwoordOproep("cc_1");
    expect(fetchMock).toHaveBeenCalledWith("https://api.telnyx.com/v2/calls/cc_1/actions/answer", expect.objectContaining({ method: "POST" }));
  });

  it("stopOpname -> POST .../actions/record_stop", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await telnyxProvider().stopOpname("cc_1");
    expect(fetchMock).toHaveBeenCalledWith("https://api.telnyx.com/v2/calls/cc_1/actions/record_stop", expect.objectContaining({ method: "POST" }));
  });
});

describe("haalOpnameOp (spec §9: provider-geauthenticeerde download, geen publieke URL)", () => {
  it("haalt eerst verse opnamemetadata op (Bearer-auth) en downloadt vervolgens de meegegeven signed mp3-URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { recording_urls: { mp3: "https://signed.example/rec.mp3?X-Amz-Signature=abc" } } }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().haalOpnameOp("rec_1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.telnyx.com/v2/recordings/rec_1", { headers: { Authorization: "Bearer test-telnyx-api-key" } });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://signed.example/rec.mp3?X-Amz-Signature=abc");
  });

  it("een niet-ok status bij het ophalen van de metadata -> gooit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(telnyxProvider().haalOpnameOp("rec_1")).rejects.toThrow();
  });

  it("metadata zonder mp3-URL -> gooit (aanroeper markeert dit als transcriptie_mislukt)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { recording_urls: {} } }) }));
    await expect(telnyxProvider().haalOpnameOp("rec_1")).rejects.toThrow();
  });

  it("een niet-ok status bij de daadwerkelijke audiodownload -> gooit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { recording_urls: { mp3: "https://signed.example/rec.mp3" } } }) })
      .mockResolvedValueOnce({ ok: false, status: 410 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(telnyxProvider().haalOpnameOp("rec_1")).rejects.toThrow();
  });
});

describe("verwijderOpname (spec §9: audio actief opruimen bij de provider)", () => {
  it("DELETE .../v2/recordings/:id met Bearer-auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await telnyxProvider().verwijderOpname("rec_1");
    expect(fetchMock).toHaveBeenCalledWith("https://api.telnyx.com/v2/recordings/rec_1", { method: "DELETE", headers: { Authorization: "Bearer test-telnyx-api-key" } });
  });

  it("een niet-ok status -> gooit (aanroeper vangt dit al af als best-effort, zie gesprek.ts)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(telnyxProvider().verwijderOpname("rec_1")).rejects.toThrow();
  });
});
