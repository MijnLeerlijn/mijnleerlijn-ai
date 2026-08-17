// Mijn Werk Fase 3 (2026-08-17) — Gmail API-laag voor de PERSOONLIJKE
// koppeling. Bewust een eigen bestand, los van lib/gmail/api.ts (Helpdesk) —
// zelfs de kleine MIME-parsing-helpers hieronder zijn gedupliceerd i.p.v.
// geïmporteerd, zodat een latere wijziging aan de Helpdesk-koppeling deze
// module nooit per ongeluk kan raken (zelfde bewuste duplicatie als de drie
// bijna-identieke profiel-fetch-functies in lib/gmail/oauth.ts,
// lib/google-calendar/oauth.ts se fetchPrimaryCalendar en dit project se
// fetchGmailProfileAddress).
//
// Alleen-lezen kant leest UITSLUITEND metadata voor de kandidatenlijst (geen
// body) — de volledige inhoud van een bericht wordt pas opgehaald na een
// expliciete "Maak antwoordvoorstel"-klik (lib/werk/mail-reply.ts), nooit
// structureel opgeslagen (opdrachtseis).

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Deterministisch voorfilter — productiecorrectie (2026-08-18): NIET meer
 * afhankelijk van `category:primary` als enige poort. Gmail's tab-
 * classificatie is niet gegarandeerd voor elk account (uitgeschakelde
 * tabbladen, sommige Workspace-instellingen) en legitieme 1-op-1-mail
 * belandt bij Gmail's eigen ML regelmatig in "Updates" — met alleen
 * category:primary viel de kandidatenlijst dan stil terug naar nul, geen
 * fout, gewoon lege uitkomst (root cause van "geen enkele mail
 * verschijnt"). In plaats daarvan uitsluitend de twee categorieën
 * uitsluiten die vrijwel nooit actie vereisen (promoties/social) — Updates
 * en Forums blijven WEL kandidaat, de AI-classificatie beoordeelt die
 * nuance, niet een categorie-gok. Werkt ook correct (degradeert
 * geruisloos naar "geen categorie-uitsluiting") op accounts zonder
 * tabbladen: category:X matcht daar simpelweg niets, dus -category:X
 * sluit dan ook niets uit.
 *
 * Losse no-reply-achtige afzenders worden WEL al op queryniveau
 * uitgesloten (goedkoop, vrijwel nooit fout-positief) — vermindert de
 * kandidatenlijst vóórdat er metadata/AI-kosten gemaakt worden.
 *
 * in:inbox sluit verzonden/gearchiveerde berichten uit — bewust GEEN
 * is:unread/is:read-filter: gelezen betekent niet afgehandeld, een
 * gelezen mail waar nog een antwoord op moet komen moet gevonden blijven.
 */
const NOREPLY_AFZENDER_UITSLUITINGEN = ["-from:noreply", "-from:no-reply", "-from:donotreply", '-from:"no.reply"'];

export function bouwKandidaatQuery(lookbackDagen: number): string {
  return [
    "in:inbox",
    "-category:promotions",
    "-category:social",
    ...NOREPLY_AFZENDER_UITSLUITINGEN,
    `newer_than:${lookbackDagen}d`,
  ].join(" ");
}

async function gmailFetch(accessToken: string, path: string): Promise<unknown> {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const tekst = await response.text().catch(() => "");
    throw new Error(`Gmail-API-aanroep mislukt (${response.status}) voor ${path}: ${tekst}`);
  }
  return response.json();
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  filename?: string;
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessageResource {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[] } & GmailMessagePart;
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function internalDateNaarIso(internalDate: string | undefined): string {
  return internalDate ? new Date(Number(internalDate)).toISOString() : new Date().toISOString();
}

export interface GmailKandidaatBericht {
  gmailMessageId: string;
  gmailThreadId: string;
  van: string;
  onderwerp: string;
  ontvangenOp: string;
  snippet: string;
}

/**
 * Zoekt kandidaat-berichten (uitsluitend id's, via `query`) en haalt
 * daarna per id ALLEEN de lichte metadata op (format=metadata — geen body).
 * Gecapt op `maxResults`, zelfde MAX_THREADS-conventie als lib/gmail/sync.ts.
 */
export async function haalKandidaatBerichten(accessToken: string, query: string, maxResults: number): Promise<GmailKandidaatBericht[]> {
  const listParams = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const lijst = (await gmailFetch(accessToken, `/messages?${listParams.toString()}`)) as { messages?: { id: string }[] };
  const ids = (lijst.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return [];

  const metaParams = new URLSearchParams({ format: "metadata" });
  metaParams.append("metadataHeaders", "From");
  metaParams.append("metadataHeaders", "Subject");

  const berichten = await Promise.all(
    ids.map(async (id) => {
      const bericht = (await gmailFetch(accessToken, `/messages/${id}?${metaParams.toString()}`)) as GmailMessageResource;
      return {
        gmailMessageId: bericht.id,
        gmailThreadId: bericht.threadId,
        van: getHeader(bericht.payload?.headers, "From"),
        onderwerp: getHeader(bericht.payload?.headers, "Subject") || "(geen onderwerp)",
        ontvangenOp: internalDateNaarIso(bericht.internalDate),
        snippet: bericht.snippet ?? "",
      };
    })
  );
  return berichten;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

/** Zeer terughoudende HTML→platte-tekst-conversie — zelfde aanpak als lib/gmail/api.ts se gelijknamige functie (eigen kopie, zie moduletoelichting). */
function htmlNaarPlatteTekst(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/tr|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Wandelt de (mogelijk geneste multipart-) MIME-boom af — text/plain heeft voorkeur, anders text/html (omgezet). Slaat bijlagen (delen met een filename) over. */
function extractBody(part: GmailMessagePart | undefined): { plain?: string; html?: string } {
  if (!part || part.filename) return {};

  if (part.mimeType === "text/plain" && part.body?.data) return { plain: decodeBase64Url(part.body.data) };
  if (part.mimeType === "text/html" && part.body?.data) return { html: decodeBase64Url(part.body.data) };

  if (part.parts) {
    let plain: string | undefined;
    let html: string | undefined;
    for (const subPart of part.parts) {
      const resultaat = extractBody(subPart);
      plain ??= resultaat.plain;
      html ??= resultaat.html;
    }
    return { plain, html };
  }
  return {};
}

function berichtTekst(payload: GmailMessagePart | undefined): string {
  const { plain, html } = extractBody(payload);
  if (plain && plain.trim()) return plain.trim();
  if (html) return htmlNaarPlatteTekst(html);
  return "";
}

export interface GmailBerichtVoorAntwoord {
  gmailMessageId: string;
  gmailThreadId: string;
  van: string;
  onderwerp: string;
  ontvangenOp: string;
  bodyText: string;
  /** RFC 2822 Message-ID-header (anders dan het Gmail-eigen id) — nodig voor In-Reply-To. */
  messageIdHeader: string;
  /** Bestaande References-header van het origineel, indien aanwezig — wordt bij het versturen aangevuld met messageIdHeader. */
  referencesHeader: string;
}

/**
 * Haalt EEN bericht volledig op (format=full) — uitsluitend aangeroepen
 * vanuit lib/werk/mail-reply.ts, ná een expliciete "Maak antwoordvoorstel"-
 * klik, en nooit opgeslagen.
 */
export async function haalBerichtVoorAntwoord(accessToken: string, messageId: string): Promise<GmailBerichtVoorAntwoord> {
  const bericht = (await gmailFetch(accessToken, `/messages/${messageId}?format=full`)) as GmailMessageResource;
  return {
    gmailMessageId: bericht.id,
    gmailThreadId: bericht.threadId,
    van: getHeader(bericht.payload?.headers, "From"),
    onderwerp: getHeader(bericht.payload?.headers, "Subject") || "(geen onderwerp)",
    ontvangenOp: internalDateNaarIso(bericht.internalDate),
    bodyText: berichtTekst(bericht.payload),
    messageIdHeader: getHeader(bericht.payload?.headers, "Message-ID"),
    referencesHeader: getHeader(bericht.payload?.headers, "References"),
  };
}

/**
 * Haalt de laatste `maxBerichten` berichten van een thread op (format=full),
 * chronologisch — voor het geval het antwoordvoorstel meer context nodig
 * heeft dan alleen het laatste bericht (opdrachtseis: "en de mailthread,
 * indien nodig"). Gecapt en licht: dit is uitsluitend voor de ene
 * AI-aanroep, nooit voor opslag.
 */
export async function haalThreadVoorAntwoord(accessToken: string, threadId: string, maxBerichten: number): Promise<GmailBerichtVoorAntwoord[]> {
  const thread = (await gmailFetch(accessToken, `/threads/${threadId}?format=full`)) as { messages?: GmailMessageResource[] };
  const berichten = (thread.messages ?? []).map((bericht) => ({
    gmailMessageId: bericht.id,
    gmailThreadId: bericht.threadId,
    van: getHeader(bericht.payload?.headers, "From"),
    onderwerp: getHeader(bericht.payload?.headers, "Subject") || "(geen onderwerp)",
    ontvangenOp: internalDateNaarIso(bericht.internalDate),
    bodyText: berichtTekst(bericht.payload),
    messageIdHeader: getHeader(bericht.payload?.headers, "Message-ID"),
    referencesHeader: getHeader(bericht.payload?.headers, "References"),
  }));
  return berichten.slice(-maxBerichten);
}

/** Alleen het e-mailadres uit een "Naam <adres>"-headerwaarde, of de waarde zelf als er geen `<...>` in zit. Geëxporteerd — lib/werk/mail-reply.ts toont het herleide adres al vóór het versturen. */
export function bareAddress(adres: string): string {
  const match = adres.match(/<([^>]+)>/);
  return (match ? (match[1] ?? adres) : adres).trim();
}

/** RFC 2047 "encoded-word" — nodig zodra een headerwaarde (bv. het onderwerp) niet-ASCII tekens bevat (bv. Nederlandse diakrieten). */
function encodeMimeHeaderWoord(tekst: string): string {
  if (/^[\x00-\x7F]*$/.test(tekst)) return tekst;
  return `=?UTF-8?B?${Buffer.from(tekst, "utf-8").toString("base64")}?=`;
}

function base64Regels(data: string): string {
  const ruw = Buffer.from(data, "utf-8").toString("base64");
  return ruw.replace(/(.{76})/g, "$1\r\n");
}

export interface AntwoordVerzendenInvoer {
  /** Ruwe "From"-headerwaarde van het origineel — bareAddress() haalt hier het adres uit; de weergavenaam wordt genegeerd. */
  oorspronkelijkeAfzender: string;
  onderwerp: string;
  bodyText: string;
  gmailThreadId: string;
  /** Leeg toegestaan (eerste bericht in een thread had zelf nog geen Message-ID om op te reageren) — dan wordt geen In-Reply-To/References gezet. */
  inReplyToMessageId: string;
  referencesHeader: string;
}

/** Geëxporteerd — lib/werk/mail-reply.ts toont het herleide onderwerp al vóór het versturen. */
export function replyOnderwerp(oorspronkelijk: string): string {
  return /^re:/i.test(oorspronkelijk.trim()) ? oorspronkelijk : `Re: ${oorspronkelijk}`;
}

/** Bouwt de raw RFC 2822-MIME-body voor het versturen — geen From-header (Gmail vult die zelf, altijd het echte gekoppelde adres, zie de Gmail-API-documentatie), platte tekst (zelfde "geen opmaak"-conventie als lib/creator/mail-reply.ts se AI-output). */
function bouwRaweMime(invoer: AntwoordVerzendenInvoer): string {
  const regels = [
    `To: ${bareAddress(invoer.oorspronkelijkeAfzender)}`,
    `Subject: ${encodeMimeHeaderWoord(replyOnderwerp(invoer.onderwerp))}`,
    "MIME-Version: 1.0",
  ];
  if (invoer.inReplyToMessageId) {
    regels.push(`In-Reply-To: ${invoer.inReplyToMessageId}`);
    const references = [invoer.referencesHeader, invoer.inReplyToMessageId].filter(Boolean).join(" ");
    regels.push(`References: ${references}`);
  }
  regels.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64Regels(invoer.bodyText));
  return regels.join("\r\n");
}

export interface AntwoordVerzendResultaat {
  gmailMessageId: string;
}

/**
 * Verstuurt het (door de gebruiker bekeken/bewerkte) antwoord via de
 * gekoppelde Gmail-account — `threadId` zorgt dat het bericht in Gmail zelf
 * in dezelfde conversatie verschijnt, In-Reply-To/References zorgen voor
 * correcte threading in andere mailclients. Uitsluitend aangeroepen na een
 * expliciete "Verstuur"-bevestiging (nooit automatisch) — vereist de
 * gmail.send-scope.
 */
export async function verstuurAntwoord(accessToken: string, invoer: AntwoordVerzendenInvoer): Promise<AntwoordVerzendResultaat> {
  const raw = Buffer.from(bouwRaweMime(invoer), "utf-8").toString("base64url");

  const response = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, threadId: invoer.gmailThreadId }),
  });

  if (!response.ok) {
    const tekst = await response.text().catch(() => "");
    throw new Error(`Versturen van het antwoord mislukt (${response.status}): ${tekst}`);
  }

  const resultaat = (await response.json()) as { id?: string };
  if (!resultaat.id) {
    throw new Error("Gmail gaf geen bericht-ID terug na versturen.");
  }
  return { gmailMessageId: resultaat.id };
}
