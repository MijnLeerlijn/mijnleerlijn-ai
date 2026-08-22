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
  // providerRecordingId/ophaalReferentie = call_control_id (bij dit event al
  // op call_leg_id genormaliseerd door vlakTelnyxEventAf, webhook-helpers.ts)
  // — GEEN los recording_id: dat veld ontbreekt op call.recording.saved,
  // hard bevestigd via Telnyx' eigen SDK-broncode (zie telnyx-provider.ts se
  // toelichting bovenaan het bestand). haalOpnameOp/verwijderOpname zoeken de
  // daadwerkelijke opname hiermee op via GET /recordings?filter[call_leg_id].
  it("event_type=call.recording.saved -> voltooid, ophaalReferentie/providerRecordingId=call_control_id, duur berekend uit start/eind", () => {
    const uitkomst = telnyxProvider().ontleedOpnameStatus({
      event_type: "call.recording.saved",
      call_control_id: "v3:abc",
      recording_started_at: "2026-08-25T10:00:00.000Z",
      recording_ended_at: "2026-08-25T10:01:35.000Z",
    });
    expect(uitkomst).toEqual({
      providerCallId: "v3:abc",
      providerRecordingId: "v3:abc",
      status: "voltooid",
      duurSeconden: 95,
      ophaalReferentie: "v3:abc",
      clientState: null,
    });
  });

  it.each(["call.recording.error", "call.hangup", "iets_onbekends"])("event_type=%s -> mislukt, GEEN ophaalReferentie ook al is call_control_id aanwezig", (eventType) => {
    const uitkomst = telnyxProvider().ontleedOpnameStatus({ event_type: eventType, call_control_id: "v3:abc" });
    expect(uitkomst.status).toBe("mislukt");
    expect(uitkomst.ophaalReferentie).toBeNull();
  });

  it("ontbrekende/onparseerbare start-/eindtijden -> duurSeconden null, gooit nooit", () => {
    expect(telnyxProvider().ontleedOpnameStatus({ event_type: "call.recording.saved" }).duurSeconden).toBeNull();
    expect(
      telnyxProvider().ontleedOpnameStatus({ event_type: "call.recording.saved", recording_started_at: "niet-een-datum", recording_ended_at: "ook-niet" }).duurSeconden
    ).toBeNull();
  });

  it("spec §10/§12/§18: client_state uit het webhookevent wordt letterlijk doorgegeven (gesprek.ts decodeert 'm zelf)", () => {
    const uitkomst = telnyxProvider().ontleedOpnameStatus({ event_type: "call.recording.saved", call_control_id: "v3:abc", client_state: "MQ==" });
    expect(uitkomst.clientState).toBe("MQ==");
  });

  it("ontbrekend client_state -> null, geen fout", () => {
    expect(telnyxProvider().ontleedOpnameStatus({ event_type: "call.recording.saved", call_control_id: "v3:abc" }).clientState).toBeNull();
  });
});

describe("ontleedSpreekAfgerond (productieblocker-ronde 2026-08-26 — spec: deterministische speak->opname-sequencing)", () => {
  it("call.speak.ended draagt call_control_id RECHTSTREEKS (geen call_leg_id-terugval nodig, i.t.t. recording-events)", () => {
    const uitkomst = telnyxProvider().ontleedSpreekAfgerond({ event_type: "call.speak.ended", call_control_id: "v3:abc", client_state: "c3RhcnRfb3BuYW1lOjA=" });
    expect(uitkomst).toEqual({ providerCallId: "v3:abc", clientState: "c3RhcnRfb3BuYW1lOjA=" });
  });

  it("ontbrekend client_state (bv. het gewone afscheidsbericht, dat geen client_state meekrijgt) -> null, geen fout", () => {
    expect(telnyxProvider().ontleedSpreekAfgerond({ event_type: "call.speak.ended", call_control_id: "v3:abc" }).clientState).toBeNull();
  });
});

describe("voerVoiceInstructiesUit (Call Control-commando's — spec §16: uitsluitend hier Telnyx-specifiek)", () => {
  function zegEnOphangenInstructie(overrides: Partial<{ tekst: string; reden: string }> = {}) {
    return {
      soort: "zeg_en_ophangen" as const,
      tekst: "Tot ziens.",
      reden: "test_reden",
      ...overrides,
    };
  }

  it("zeg_en_ophangen -> spreekt UITSLUITEND de tekst uit (productieregressie 2026-08-27: werd voorheen GEVOLGD DOOR een onmiddellijke hangup, die de tekst afsneed voordat er iets hoorbaar was) — hangt zelf niet meteen op", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const respons = await telnyxProvider().voerVoiceInstructiesUit("cc_1", [zegEnOphangenInstructie({ reden: "geen_training_gevonden" })]);

    expect(respons).toEqual({ status: 200, contentType: null, body: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [speakUrl, speakInit] = fetchMock.mock.calls[0]!;
    expect(speakUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/speak");
    expect((speakInit as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer test-telnyx-api-key");
    const speakBody = JSON.parse((speakInit as { body: string }).body);
    expect(speakBody).toMatchObject({ payload: "Tot ziens.", command_id: "speak:cc_1:speak-hangup-geen_training_gevonden" });
    // client_state (spec: "nergens meer terminale tekst afspelen waarna de
    // call onmiddellijk wordt opgehangen") codeert "hangup_na_spraak:<reden>"
    // — gedecodeerd door gesprek.ts se verwerkSpreekAfgerond ná
    // call.speak.ended, NOOIT hier al vooruitlopend ophangen.
    expect(Buffer.from(speakBody.client_state, "base64").toString("utf8")).toBe("hangup_na_spraak:geen_training_gevonden");
  });

  it("hangup_uitvoeren -> POST .../actions/hangup met een reden-gebaseerd command_id — uitsluitend uitgevoerd NA call.speak.ended (via gesprek.ts se verwerkSpreekAfgerond)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [{ soort: "hangup_uitvoeren", reden: "geen_training_gevonden" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [hangupUrl, hangupInit] = fetchMock.mock.calls[0]!;
    expect(hangupUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/hangup");
    expect(JSON.parse((hangupInit as { body: string }).body)).toMatchObject({ command_id: "hangup:cc_1:hangup-geen_training_gevonden" });
  });

  it("dubbel afgeleverde hangup_uitvoeren (bv. Telnyx' eigen webhook-redelivery van call.speak.ended) krijgt TWEEMAAL hetzelfde command_id — Telnyx' eigen deduplicatie voorkomt een dubbele hangup, geen apart nonce nodig (deze actie komt legitiem maar één keer per gesprek voor)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const instructie = { soort: "hangup_uitvoeren" as const, reden: "geen_training_gevonden" };

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [instructie]);
    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [instructie]);

    const eersteCommandId = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body).command_id;
    const tweedeCommandId = JSON.parse((fetchMock.mock.calls[1]![1] as { body: string }).body).command_id;
    expect(tweedeCommandId).toBe(eersteCommandId);
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
    // minimum_digits/maximum_digits (niet min_digits/max_digits) + service_level:"premium"
    // (vereist voor nl-NL, "basic" staat alleen en-US toe) — bevestigd via
    // Telnyx' eigen SDK-broncode (src/resources/calls/actions.ts).
    expect(body).toMatchObject({
      payload: "Kies een optie.",
      maximum_digits: 1,
      minimum_digits: 1,
      inter_digit_timeout_millis: 8000,
      service_level: "premium",
      language: "nl-NL",
      command_id: "gather_using_speak:cc_1",
    });
  });

  function zegEnNeemOpInstructie(overrides: Partial<{ poging: number }> = {}) {
    return {
      soort: "zeg_en_neem_op" as const,
      tekst: "Vertel je verslag.",
      actieUrl: "https://ongebruikt.example",
      statusCallbackUrl: "https://ongebruikt.example",
      stopToets: "#",
      herstartToets: "*",
      poging: 0,
      ...overrides,
    };
  }

  function opnameStartenInstructie(overrides: Partial<{ poging: number }> = {}) {
    return {
      soort: "opname_starten" as const,
      maxDuurSeconden: 900,
      stilteTimeoutSeconden: 5,
      stopToets: "#",
      herstartToets: "*",
      poging: 0,
      ...overrides,
    };
  }

  it("zeg_en_neem_op -> spreekt UITSLUITEND de tekst uit (fix 2026-08-26: werd voorheen NOOIT uitgesproken) — start ZELF geen opname meer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [zegEnNeemOpInstructie()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [speakUrl, speakInit] = fetchMock.mock.calls[0]!;
    expect(speakUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/speak");
    const speakBody = JSON.parse((speakInit as { body: string }).body);
    expect(speakBody).toMatchObject({ payload: "Vertel je verslag.", payload_type: "text", command_id: "speak:cc_1:speak-start-poging0" });
    // client_state (spec: deterministische speak->opname-sequencing) codeert
    // "start_opname:0" — gedecodeerd door gesprek.ts se verwerkSpreekAfgerond
    // ná call.speak.ended, NOOIT hier al vooruitlopend een opname starten.
    expect(Buffer.from(speakBody.client_state, "base64").toString("utf8")).toBe("start_opname:0");
  });

  it("opname_starten -> record_start, dan een parallelle stille gather — uitsluitend uitgevoerd NA call.speak.ended (via gesprek.ts se verwerkSpreekAfgerond)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [opnameStartenInstructie()]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [recordUrl, recordInit] = fetchMock.mock.calls[0]!;
    expect(recordUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/record_start");
    const recordBody = JSON.parse((recordInit as { body: string }).body);
    expect(recordBody).toMatchObject({ format: "mp3", channels: "single", max_length: 900, timeout_secs: 5, command_id: "record_start:cc_1:poging0" });
    // client_state draagt het pogingnummer (spec §10/§12/§18) — base64("0").
    expect(recordBody.client_state).toBe(Buffer.from("0", "utf8").toString("base64"));

    const [gatherUrl, gatherInit] = fetchMock.mock.calls[1]!;
    expect(gatherUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/gather");
    const gatherBody = JSON.parse((gatherInit as { body: string }).body);
    expect(gatherBody).toMatchObject({ gather_id: "opname_toets", valid_digits: "#*", minimum_digits: 1, maximum_digits: 1, command_id: "gather:cc_1:poging0" });
  });

  it("spec §10/§11: een hogere poging (na een '*'-herstart) krijgt een eigen command_id/client_state — nooit gededupliceerd tegen de vorige poging", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [opnameStartenInstructie({ poging: 1 })]);

    const recordBody = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(recordBody.command_id).toBe("record_start:cc_1:poging1");
    expect(recordBody.client_state).toBe(Buffer.from("1", "utf8").toString("base64"));
    const gatherBody = JSON.parse((fetchMock.mock.calls[1]![1] as { body: string }).body);
    expect(gatherBody.command_id).toBe("gather:cc_1:poging1");
  });

  it("command_id (spec: Telnyx' eigen commando-deduplicatie) is deterministisch per actiesoort+gesprek+poging — dezelfde instructie tweemaal uitgevoerd (bv. door een dubbele webhookaflevering) levert dus TWEEMAAL exact hetzelfde command_id op, zodat Telnyx zelf de herhaling negeert i.p.v. een tweede opname te starten", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const instructie = opnameStartenInstructie();

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [instructie]);
    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [instructie]); // simuleert een herhaalde aanroep voor hetzelfde gesprek

    const eersteBody = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    const tweedeBody = JSON.parse((fetchMock.mock.calls[2]![1] as { body: string }).body); // 2 aanroepen per uitvoering (record_start,gather)
    expect(eersteBody.command_id).toBe("record_start:cc_1:poging0");
    expect(tweedeBody.command_id).toBe(eersteBody.command_id);
  });

  it("stop_opname -> POST .../actions/record_stop met een per-poging command_id (spec §9/§10)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [{ soort: "stop_opname", poging: 2 }]);

    expect(fetchMock).toHaveBeenCalledWith("https://api.telnyx.com/v2/calls/cc_1/actions/record_stop", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toMatchObject({ command_id: "record_stop:cc_1:poging2" });
  });

  it("spec §11 (4e+ '*' op de limiet): zeg_en_hervat_opname pauzeert EERST de opname, spreekt dan de waarschuwing — de opname zelf wordt nooit gestopt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [{ soort: "zeg_en_hervat_opname", tekst: "Je kunt niet nog een keer opnieuw beginnen.", poging: 3, nonce: 12345 }]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [pauzeUrl, pauzeInit] = fetchMock.mock.calls[0]!;
    expect(pauzeUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/record_pause");
    expect(JSON.parse((pauzeInit as { body: string }).body)).toMatchObject({ command_id: "record_pause:cc_1:pauze-poging3-12345" });

    const [speakUrl, speakInit] = fetchMock.mock.calls[1]!;
    expect(speakUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/speak");
    const speakBody = JSON.parse((speakInit as { body: string }).body);
    expect(speakBody.payload).toBe("Je kunt niet nog een keer opnieuw beginnen.");
    expect(Buffer.from(speakBody.client_state, "base64").toString("utf8")).toBe("hervat_opname:3:12345");
  });

  it("opname_hervatten -> record_resume, dan een parallelle stille gather (herbewapent na de limietwaarschuwing, laat de poging ongewijzigd)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [{ soort: "opname_hervatten", maxDuurSeconden: 900, stopToets: "#", herstartToets: "*", poging: 3, nonce: 12345 }]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [resumeUrl, resumeInit] = fetchMock.mock.calls[0]!;
    expect(resumeUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/record_resume");
    expect(JSON.parse((resumeInit as { body: string }).body)).toMatchObject({ command_id: "record_resume:cc_1:hervat-poging3-12345" });

    const [gatherUrl, gatherInit] = fetchMock.mock.calls[1]!;
    expect(gatherUrl).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/gather");
    expect(JSON.parse((gatherInit as { body: string }).body)).toMatchObject({ gather_id: "opname_toets", valid_digits: "#*", command_id: "gather:cc_1:hervat-poging3-12345" });
  });

  it("twee ACHTEREENVOLGENDE keren op de limiet (zelfde poging, verschillend nonce) krijgen VERSCHILLENDE command_id's — de tweede her-bewapening wordt niet ten onrechte gededupliceerd tegen de eerste", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [{ soort: "opname_hervatten", maxDuurSeconden: 900, stopToets: "#", herstartToets: "*", poging: 3, nonce: 111 }]);
    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [{ soort: "opname_hervatten", maxDuurSeconden: 900, stopToets: "#", herstartToets: "*", poging: 3, nonce: 222 }]);

    const gatherCommandIds = [fetchMock.mock.calls[1]!, fetchMock.mock.calls[3]!].map((call) => JSON.parse((call[1] as { body: string }).body).command_id);
    expect(new Set(gatherCommandIds).size).toBe(2);
  });

  it("command_id verschilt tussen verschillende gesprekken (call_control_id) én tussen verschillende actiesoorten binnen hetzelfde gesprek — nooit een botsing die een legitieme, andere actie zou laten negeren", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [zegEnOphangenInstructie({ reden: "x" })]);
    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [{ soort: "hangup_uitvoeren", reden: "x" }]);
    await telnyxProvider().voerVoiceInstructiesUit("cc_2", [zegEnOphangenInstructie({ reden: "x" })]);

    const commandIds = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as { body: string }).body).command_id);
    expect(new Set(commandIds).size).toBe(commandIds.length); // speak:cc_1:..., hangup:cc_1:..., speak:cc_2:... — allemaal uniek
  });

  it("meerdere instructies worden na elkaar uitgevoerd, in volgorde", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().voerVoiceInstructiesUit("cc_1", [zegEnOphangenInstructie({ reden: "een" }), { soort: "hangup_uitvoeren", reden: "twee" }]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/speak");
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.telnyx.com/v2/calls/cc_1/actions/hangup");
  });

  it("een falend commando wordt intern gevangen — voerVoiceInstructiesUit gooit NOOIT door (spec: nooit een onnodige 5xx/crash op de webhookhandler)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));

    await expect(telnyxProvider().voerVoiceInstructiesUit("cc_1", [zegEnOphangenInstructie()])).resolves.toEqual({
      status: 200,
      contentType: null,
      body: null,
    });
  });
});

describe("beantwoordOproep", () => {
  it("beantwoordOproep -> POST .../actions/answer met command_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await telnyxProvider().beantwoordOproep("cc_1");
    expect(fetchMock).toHaveBeenCalledWith("https://api.telnyx.com/v2/calls/cc_1/actions/answer", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toMatchObject({ command_id: "answer:cc_1" });
  });
});
// stop_opname (voorheen een losse stopOpname()-providermethode, 2026-08-26
// vervangen door de VoiceInstructie-variant — zie het opleverrapport) heeft
// zijn eigen dekking in de "voerVoiceInstructiesUit"-describe hierboven.

// call.recording.saved bevat geen recording_id (hard bevestigd via Telnyx'
// eigen SDK-broncode) — haalOpnameOp/verwijderOpname zoeken de opname daarom
// eerst op via GET /recordings?filter[call_leg_id]=... (waarbij
// ophaalReferentie/providerRecordingId het call_leg_id zelf is, zie
// ontleedOpnameStatus hierboven), en lezen daar `download_urls.mp3` (NIET
// recording_urls.mp3 — dat bestaat alleen op het webhookpayload zelf, een
// andere resource-representatie dan de REST-respons).
describe("haalOpnameOp (spec §9: provider-geauthenticeerde download, geen publieke URL)", () => {
  it("zoekt eerst de opname op via GET /recordings?filter[call_leg_id]=... en downloadt vervolgens download_urls.mp3", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "rec_1", download_urls: { mp3: "https://signed.example/rec.mp3?X-Amz-Signature=abc" } }] }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().haalOpnameOp("cc_leg_1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.telnyx.com/v2/recordings?filter%5Bcall_leg_id%5D=cc_leg_1", { headers: { Authorization: "Bearer test-telnyx-api-key" } });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://signed.example/rec.mp3?X-Amz-Signature=abc");
  });

  // Live HTTP 422 (2026-08-25, oproep-ID 5) — onderzocht tegen de officiële
  // telnyx-npm-broncode (RecordingListParams.Filter in
  // src/resources/recordings/recordings.ts): filter[call_leg_id] IS een
  // echt, gedocumenteerd queryparameter van GET /v2/recordings. Deze test
  // legt de EXACTE, tegen Telnyx' eigen qs.stringify({filter:{call_leg_id}},
  // {arrayFormat:'comma'}) byte-voor-byte geverifieerde queryvorm vast: op
  // het basispad precies één filterparameter, met exact de meegegeven
  // waarde — geen paginering/sortering/overige parameters die niet expliciet
  // gevraagd zijn.
  it("de exacte queryvorm naar GET /v2/recordings — precies één filter[call_leg_id]-parameter, geen overige/overbodige parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "rec_1", download_urls: { mp3: "https://signed.example/rec.mp3" } }] }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().haalOpnameOp("leg_abc123");

    const [url] = fetchMock.mock.calls[0]!;
    const geparsed = new URL(url as string);
    expect(geparsed.origin + geparsed.pathname).toBe("https://api.telnyx.com/v2/recordings");
    expect([...geparsed.searchParams.keys()]).toEqual(["filter[call_leg_id]"]);
    expect(geparsed.searchParams.get("filter[call_leg_id]")).toBe("leg_abc123");
  });

  it("een niet-ok status bij het ophalen van de opnamelijst -> gooit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }));
    await expect(telnyxProvider().haalOpnameOp("cc_leg_1")).rejects.toThrow();
  });

  // Live HTTP 422 vervolg: "HTTP 422" alleen was te weinig om de eerste live
  // integratie te diagnosticeren (foutmelding uit de database bevatte
  // uitsluitend de statuscode). telnyxFoutdetail() leest Telnyx' eigen
  // gedocumenteerde JSON:API-foutvorm (Shared.APIError in shared.ts:
  // {code, title, description?, source?: {parameter, pointer}}, verpakt als
  // {errors:[...]}) veilig en begrensd uit, zodat een volgende 4xx zichzelf
  // direct diagnosticeert.
  it("een 422 met Telnyx' eigen JSON:API-foutvorm (alle vijf velden gevuld) -> elk veld verschijnt EXPLICIET gelabeld in de foutmelding", async () => {
    const telnyxFoutBody = {
      errors: [
        {
          code: "10007",
          title: "Invalid query parameter value",
          description: "The value provided for filter[call_leg_id] is not valid.",
          source: { parameter: "filter[call_leg_id]", pointer: "/data/attributes/filter" },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => JSON.stringify(telnyxFoutBody) }));

    const foutmelding = await telnyxProvider()
      .haalOpnameOp("cc_leg_1")
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

    expect(foutmelding).toContain("code=10007");
    expect(foutmelding).toContain('title="Invalid query parameter value"');
    expect(foutmelding).toContain('description="The value provided for filter[call_leg_id] is not valid."');
    expect(foutmelding).toContain("source.parameter=filter[call_leg_id]");
    expect(foutmelding).toContain("source.pointer=/data/attributes/filter");
  });

  // Live bevestigd (2026-08-25, oproep-ID 6, ná de eerste 422-fix): Telnyx'
  // eigen respons had UITSLUITEND description gevuld ("is invalid") — code/
  // title/source waren allemaal leeg. De oude parser gaf daardoor kaal "is
  // invalid" terug, niet te herleiden tot welk veld dat was. Deze test
  // reproduceert die exacte live situatie en bevestigt de fix: het veld
  // verschijnt nu WEL gelabeld, en de afwezigheid van de andere velden is
  // zelf ook geen gok meer (ze staan er simpelweg niet bij, i.p.v. een
  // ambigue lege string ertussen).
  it("een 422 met UITSLUITEND description gevuld (live oproep-ID 6: 'is invalid') -> de foutmelding toont description= gelabeld, niet kaal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => JSON.stringify({ errors: [{ description: "is invalid" }] }) }));

    const foutmelding = await telnyxProvider()
      .haalOpnameOp("cc_leg_1")
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

    expect(foutmelding).toContain('description="is invalid"');
    expect(foutmelding).not.toMatch(/HTTP 422 — is invalid$/); // niet meer de oude, ongelabelde vorm
  });

  it("meerdere foutitems in de errors-array -> alleen het eerste volledig getoond, met een expliciete '+N meer'-aanduiding (nooit stilzwijgend afgekapt)", async () => {
    const telnyxFoutBody = {
      errors: [{ code: "10007", title: "Invalid query parameter value" }, { code: "10008", title: "Another issue" }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => JSON.stringify(telnyxFoutBody) }));

    await expect(telnyxProvider().haalOpnameOp("cc_leg_1")).rejects.toThrow(/code=10007[\s\S]*\(\+1 meer\)/);
  });

  it("de foutmelding bij een 4xx bevat nooit de Authorization-header/API-key en blijft begrensd, ook bij een extreem lange/onverwachte (niet-JSON) responsbody", async () => {
    const onverwachteTekst = "x".repeat(2000); // geen geldige JSON -> valt terug op de rauwe (begrensde) tekst
    // Elke aanroep (ook de call_session_id-terugvalpoging, zie
    // haalCallSessionId/haalOpnames) faalt hier op dezelfde manier — bewijst
    // dat zelfs bij BEIDE mislukte pogingen de gecombineerde foutmelding nog
    // altijd begrensd blijft (nooit de rauwe 2000-tekens-body onbegrensd
    // doorgeeft), niet dat er maar één aanroep gebeurt.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => onverwachteTekst }));

    const foutmelding = await telnyxProvider()
      .haalOpnameOp("cc_leg_1")
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

    expect(foutmelding).not.toContain("test-telnyx-api-key");
    // Ruimer dan bij één enkele poging (TELNYX_FOUTDETAIL_MAX_LENGTE=300):
    // de call_leg_id-poging faalt hier al vóór de call_session_id-terugval
    // ooit kan starten (haalCallSessionId ziet zelf ook ok:false -> geeft
    // null terug), dus de foutmelding bevat alleen de eerste 300 tekens plus
    // een korte, vaste omlijstende tekst — nooit de volledige 2000 tekens.
    expect((foutmelding as string).length).toBeLessThan(600);
  });

  // Live HTTP 422 vervolg (2026-08-25, oproep-ID 6, transcriptiePogingen
  // 4/5): "HTTP 422 — source.pointer=/call_id" op de call_leg_id-gebaseerde
  // opzoeking. Onderzoek (zie telnyx-provider.ts se uitgebreide toelichting
  // bij haalCallSessionId/haalOpnames): "call_id" komt nergens voor als
  // publiek veld in Telnyx' Call Control/Recordings-oppervlak — call_leg_id
  // blijft dus een geldig, gedocumenteerd queryparameter, geen naamfout. De
  // deterministische, eveneens officieel gedocumenteerde terugvalpoging is
  // call_session_id (GET /v2/calls/{call_control_id} -> verplicht veld
  // call_session_id -> GET /v2/recordings?filter[call_session_id]=...).
  describe("call_session_id-terugval bij een 4xx op de call_leg_id-opzoeking", () => {
    it("call_leg_id geeft 422 -> haalt call_session_id op via GET /v2/calls/{id} -> vindt de opname via filter[call_session_id] (exacte queryvorm/volgorde van alle vier aanroepen)", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 422, text: async () => JSON.stringify({ errors: [{ code: "10007", source: { pointer: "/call_id" } }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { call_session_id: "sess_abc" } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "rec_1", download_urls: { mp3: "https://signed.example/rec.mp3" } }] }) })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
      vi.stubGlobal("fetch", fetchMock);

      await telnyxProvider().haalOpnameOp("cc_leg_1");

      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.telnyx.com/v2/recordings?filter%5Bcall_leg_id%5D=cc_leg_1", { headers: { Authorization: "Bearer test-telnyx-api-key" } });
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.telnyx.com/v2/calls/cc_leg_1", { headers: { Authorization: "Bearer test-telnyx-api-key" } });
      expect(fetchMock).toHaveBeenNthCalledWith(3, "https://api.telnyx.com/v2/recordings?filter%5Bcall_session_id%5D=sess_abc", { headers: { Authorization: "Bearer test-telnyx-api-key" } });
      expect(fetchMock).toHaveBeenNthCalledWith(4, "https://signed.example/rec.mp3");
    });

    it("call_leg_id geeft 4xx EN GET /v2/calls/{id} mislukt ook -> gooit een gecombineerde foutmelding, GEEN derde aanroep (geen tijdstip-gok/fallback zonder een echte call_session_id)", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 422, text: async () => JSON.stringify({ errors: [{ code: "10007", source: { pointer: "/call_id" } }] }) })
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "" });
      vi.stubGlobal("fetch", fetchMock);

      await expect(telnyxProvider().haalOpnameOp("cc_leg_1")).rejects.toThrow(/call_leg_id[\s\S]*code=10007[\s\S]*call_session_id kon niet worden opgehaald/);
      expect(fetchMock).toHaveBeenCalledTimes(2); // nooit een derde, "blinde" poging zonder geldig call_session_id
    });

    it("call_leg_id geeft 4xx, call_session_id wordt gevonden, maar de terugvalopzoeking zelf geeft ook een 4xx -> gecombineerde foutmelding met BEIDE foutdetails", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 422, text: async () => JSON.stringify({ errors: [{ code: "10007", title: "eerste poging" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { call_session_id: "sess_abc" } }) })
        .mockResolvedValueOnce({ ok: false, status: 422, text: async () => JSON.stringify({ errors: [{ code: "20099", title: "tweede poging" }] }) });
      vi.stubGlobal("fetch", fetchMock);

      await expect(telnyxProvider().haalOpnameOp("cc_leg_1")).rejects.toThrow(/code=10007[\s\S]*code=20099/);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("verwijderOpname profiteert van dezelfde terugval (gedeelde haalOpnames-functie) — DELETE't de via call_session_id gevonden opname", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 422, text: async () => JSON.stringify({ errors: [{ code: "10007" }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { call_session_id: "sess_abc" } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "rec_1" }] }) })
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      await telnyxProvider().verwijderOpname("cc_leg_1");

      expect(fetchMock).toHaveBeenNthCalledWith(4, "https://api.telnyx.com/v2/recordings/rec_1", { method: "DELETE", headers: { Authorization: "Bearer test-telnyx-api-key" } });
    });
  });

  it("lege opnamelijst (nog niet geïndexeerd bij Telnyx) -> gooit met een herkenbare, specifieke foutmelding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    await expect(telnyxProvider().haalOpnameOp("cc_leg_1")).rejects.toThrow(/geen opname gevonden/i);
  });

  it("gevonden opname zonder mp3-downloadlink -> gooit (aanroeper markeert dit als transcriptie_mislukt)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "rec_1", download_urls: {} }] }) }));
    await expect(telnyxProvider().haalOpnameOp("cc_leg_1")).rejects.toThrow();
  });

  it("een niet-ok status bij de daadwerkelijke audiodownload -> gooit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "rec_1", download_urls: { mp3: "https://signed.example/rec.mp3" } }] }) })
      .mockResolvedValueOnce({ ok: false, status: 410 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(telnyxProvider().haalOpnameOp("cc_leg_1")).rejects.toThrow();
  });

  // Live bevestigd (2026-08-25): één testgesprek leverde twee losse opnames
  // op bij Telnyx (zie telnyx-provider.ts se kiesOpname voor de volledige
  // toelichting/oorzaakanalyse). De recordings-lijst-API documenteert geen
  // sorteervolgorde (RecordingListParams heeft, anders dan bv.
  // CallControlApplicationListParams, geen `sort`-parameter) — deze tests
  // bewijzen dat de keuze NOOIT op lijstpositie leunt, uitsluitend op de
  // expliciete, inhoudelijk onderbouwde opnameduur (recording_ended_at minus
  // recording_started_at).
  it("meerdere opnames voor hetzelfde gesprek -> kiest de opname met de LANGSTE duur, ook als die NIET het eerste lijstelement is", async () => {
    const kort = { id: "rec_kort", download_urls: { mp3: "https://signed.example/kort.mp3" }, recording_started_at: "2026-08-25T10:00:00.000Z", recording_ended_at: "2026-08-25T10:00:05.000Z" };
    const lang = { id: "rec_lang", download_urls: { mp3: "https://signed.example/lang.mp3" }, recording_started_at: "2026-08-25T10:00:01.000Z", recording_ended_at: "2026-08-25T10:02:30.000Z" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [kort, lang] }) }) // kort staat EERST in de lijst
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().haalOpnameOp("cc_leg_1");

    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://signed.example/lang.mp3"); // de langere opname, niet de eerste in de lijst
  });

  it("gelijke opnameduur -> kiest de opname met de meest recente recording_started_at als tiebreaker", async () => {
    const eerder = { id: "rec_eerder", download_urls: { mp3: "https://signed.example/eerder.mp3" }, recording_started_at: "2026-08-25T10:00:00.000Z", recording_ended_at: "2026-08-25T10:01:00.000Z" };
    const later = { id: "rec_later", download_urls: { mp3: "https://signed.example/later.mp3" }, recording_started_at: "2026-08-25T10:05:00.000Z", recording_ended_at: "2026-08-25T10:06:00.000Z" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [eerder, later] }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().haalOpnameOp("cc_leg_1");

    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://signed.example/later.mp3");
  });

  it("meerdere opnames voor hetzelfde gesprek -> logt een diagnostische waarschuwing (uitsluitend id's/tijden, nooit audio-inhoud)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = { id: "rec_a", download_urls: { mp3: "https://signed.example/a.mp3" }, recording_started_at: "2026-08-25T10:00:00.000Z", recording_ended_at: "2026-08-25T10:00:10.000Z" };
    const b = { id: "rec_b", download_urls: { mp3: "https://signed.example/b.mp3" }, recording_started_at: "2026-08-25T10:00:00.000Z", recording_ended_at: "2026-08-25T10:00:05.000Z" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [a, b] }) })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    );

    await telnyxProvider().haalOpnameOp("cc_leg_1");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("meerdere opnames gevonden"));
    expect(consoleSpy.mock.calls[0]![0]).not.toMatch(/mp3|http/i); // geen URL's/downloadlinks in de logregel
    consoleSpy.mockRestore();
  });

  it("precies één opname -> GEEN waarschuwing gelogd (alleen bij meer dan één kandidaat)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "rec_1", download_urls: { mp3: "https://signed.example/rec.mp3" } }] }) })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    );

    await telnyxProvider().haalOpnameOp("cc_leg_1");

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("verwijderOpname (spec §9: audio actief opruimen bij de provider)", () => {
  it("zoekt eerst de opname op via het call_leg_id, DELETE't vervolgens het gevonden recording_id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "rec_1" }] }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().verwijderOpname("cc_leg_1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.telnyx.com/v2/recordings?filter%5Bcall_leg_id%5D=cc_leg_1", { headers: { Authorization: "Bearer test-telnyx-api-key" } });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.telnyx.com/v2/recordings/rec_1", { method: "DELETE", headers: { Authorization: "Bearer test-telnyx-api-key" } });
  });

  it("een niet-ok status bij het opzoeken -> gooit (aanroeper vangt dit al af als best-effort, zie gesprek.ts)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(telnyxProvider().verwijderOpname("cc_leg_1")).rejects.toThrow();
  });

  it("een niet-ok status bij de daadwerkelijke DELETE -> gooit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "rec_1" }] }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(telnyxProvider().verwijderOpname("cc_leg_1")).rejects.toThrow();
  });

  // Spec §9/gate 1: nooit audio onbeperkt laten staan. Was er (bv. door een
  // vóór de command_id-fix al ontstane dubbele opname) meer dan één
  // kandidaat, dan mag GEEN ervan achterblijven — anders zou de niet-
  // gekozen dubbele opname voor altijd bij Telnyx blijven staan.
  it("meerdere opnames voor hetzelfde gesprek -> verwijdert ZOWEL de gekozen (langste duur) ALS de overige(n), nooit een dubbele opname laten staan", async () => {
    const kort = { id: "rec_kort", recording_started_at: "2026-08-25T10:00:00.000Z", recording_ended_at: "2026-08-25T10:00:05.000Z" };
    const lang = { id: "rec_lang", recording_started_at: "2026-08-25T10:00:01.000Z", recording_ended_at: "2026-08-25T10:02:30.000Z" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [kort, lang] }) })
      .mockResolvedValueOnce({ ok: true }) // DELETE rec_lang (primair, langste duur)
      .mockResolvedValueOnce({ ok: true }); // DELETE rec_kort (overige)
    vi.stubGlobal("fetch", fetchMock);

    await telnyxProvider().verwijderOpname("cc_leg_1");

    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.telnyx.com/v2/recordings/rec_lang", expect.objectContaining({ method: "DELETE" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://api.telnyx.com/v2/recordings/rec_kort", expect.objectContaining({ method: "DELETE" }));
  });

  it("een falende verwijdering van een EXTRA (niet-gekozen) dubbele opname blokkeert niet de al-geslaagde hoofdverwijdering — best-effort, gooit niet door", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const kort = { id: "rec_kort", recording_started_at: "2026-08-25T10:00:00.000Z", recording_ended_at: "2026-08-25T10:00:05.000Z" };
    const lang = { id: "rec_lang", recording_started_at: "2026-08-25T10:00:01.000Z", recording_ended_at: "2026-08-25T10:02:30.000Z" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [kort, lang] }) })
      .mockResolvedValueOnce({ ok: true }) // DELETE rec_lang (primair) — slaagt
      .mockResolvedValueOnce({ ok: false, status: 500 }); // DELETE rec_kort (extra) — faalt
    vi.stubGlobal("fetch", fetchMock);

    await expect(telnyxProvider().verwijderOpname("cc_leg_1")).resolves.toBeUndefined(); // gooit niet door
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("extra dubbele opname verwijderen mislukt"), expect.anything());
    consoleSpy.mockRestore();
  });
});
