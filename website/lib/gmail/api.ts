// Gmail API-laag: threads opzoeken/ophalen en hun MIME-inhoud omzetten naar
// platte tekst. Rechtstreekse fetch-aanroepen (zelfde reden als lib/gmail/
// oauth.ts: twee/drie eenvoudige HTTP-aanroepen, geen googleapis-SDK nodig).
// Haalt bewust NOOIT een bijlage op (geen aanroep naar het attachments-
// endpoint) — dat is hoe "geen bijlagen in deze eerste versie" hier
// afgedwongen wordt, niet door iets achteraf weg te filteren.

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  filename?: string;
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

interface GmailThreadResponse {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export interface ParsedGmailMessage {
  gmailMessageId: string;
  from: string;
  to: string[];
  cc: string[];
  sentAt: string;
  subject: string;
  bodyText: string;
}

export interface ParsedGmailThread {
  gmailThreadId: string;
  subject: string;
  participants: string[];
  firstMessageAt: string;
  lastMessageAt: string;
  messageCount: number;
  snippet: string;
  messages: ParsedGmailMessage[];
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

/** Lijst van thread-id's die aan `query` voldoen, tot maximaal `maxResults`. */
export async function listThreadIds(
  accessToken: string,
  query: string,
  maxResults: number
): Promise<string[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const data = (await gmailFetch(accessToken, `/threads?${params.toString()}`)) as {
    threads?: { id: string }[];
  };
  return (data.threads ?? []).map((t) => t.id);
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/**
 * Splitst een "To"/"Cc"-headerwaarde in losse adressen — komma-gescheiden,
 * maar met respect voor komma's binnen aanhalingstekens in een weergavenaam
 * (bv. `"Achternaam, Voornaam" <a@b.nl>, c@d.nl`).
 */
export function parseAddressList(headerValue: string): string[] {
  if (!headerValue) return [];
  const delen: string[] = [];
  let huidig = "";
  let inAanhalingstekens = false;
  for (const teken of headerValue) {
    if (teken === '"') inAanhalingstekens = !inAanhalingstekens;
    if (teken === "," && !inAanhalingstekens) {
      delen.push(huidig.trim());
      huidig = "";
    } else {
      huidig += teken;
    }
  }
  if (huidig.trim()) delen.push(huidig.trim());
  return delen.filter(Boolean);
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

/**
 * Zeer terughoudende HTML→platte-tekst-conversie — bewaart liever te veel
 * tekst dan te weinig (geen agressieve verwijdering van citaten/
 * handtekeningen, zie de opdracht). Zet alleen blokniveau-elementen om in
 * regeleinden vóór het strippen van tags, zodat structuur leesbaar blijft.
 */
export function htmlToPlainText(html: string): string {
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

/**
 * Wandelt de (mogelijk geneste multipart-) MIME-boom af en geeft de eerste
 * bruikbare tekstinhoud terug — text/plain heeft voorkeur, anders text/html
 * (omgezet). Slaat expliciet delen met een `filename` over (bijlagen).
 */
function extractBody(part: GmailMessagePart | undefined): { plain?: string; html?: string } {
  if (!part) return {};
  if (part.filename) return {};

  if (part.mimeType === "text/plain" && part.body?.data) {
    return { plain: decodeBase64Url(part.body.data) };
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return { html: decodeBase64Url(part.body.data) };
  }

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

function messageBodyText(payload: GmailMessagePart | undefined): string {
  const { plain, html } = extractBody(payload);
  if (plain && plain.trim()) return plain.trim();
  if (html) return htmlToPlainText(html);
  return "";
}

function parseMessage(message: GmailMessage): ParsedGmailMessage {
  const headers = message.payload?.headers;
  const sentAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date().toISOString();

  return {
    gmailMessageId: message.id,
    from: getHeader(headers, "From"),
    to: parseAddressList(getHeader(headers, "To")),
    cc: parseAddressList(getHeader(headers, "Cc")),
    sentAt,
    subject: getHeader(headers, "Subject"),
    bodyText: messageBodyText(message.payload),
  };
}

/** Alleen het e-mailadres uit een "Naam <adres>"-headerwaarde, of de waarde zelf als er geen `<...>` in zit. */
function bareAddress(adres: string): string {
  const match = adres.match(/<([^>]+)>/);
  return (match ? (match[1] ?? adres) : adres).trim().toLowerCase();
}

/**
 * Haalt een complete thread op (alle berichten, inclusief verzonden
 * antwoorden — gmail.readonly geeft toegang tot de hele mailbox, dus ook
 * het SENT-label) en zet die om naar het canonieke, opslaanbare model.
 */
export async function fetchFullThread(accessToken: string, threadId: string): Promise<ParsedGmailThread> {
  const data = (await gmailFetch(accessToken, `/threads/${threadId}?format=full`)) as GmailThreadResponse;
  const berichten = (data.messages ?? []).map(parseMessage);
  if (berichten.length === 0) {
    throw new Error(`Thread ${threadId} bevat geen berichten.`);
  }

  const gesorteerd = [...berichten].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
  );
  // Non-null: berichten.length > 0 is hierboven al geverifieerd, gesorteerd
  // heeft dezelfde lengte.
  const eerste = gesorteerd[0]!;
  const laatste = gesorteerd[gesorteerd.length - 1]!;

  const deelnemers = new Set<string>();
  for (const bericht of berichten) {
    if (bericht.from) deelnemers.add(bareAddress(bericht.from));
    for (const adres of [...bericht.to, ...bericht.cc]) deelnemers.add(bareAddress(adres));
  }

  const laatsteRuweBericht = (data.messages ?? []).find((m) => m.id === laatste.gmailMessageId);

  return {
    gmailThreadId: data.id,
    subject: eerste.subject || "(geen onderwerp)",
    participants: [...deelnemers].filter(Boolean),
    firstMessageAt: eerste.sentAt,
    lastMessageAt: laatste.sentAt,
    messageCount: berichten.length,
    snippet: laatsteRuweBericht?.snippet ?? "",
    messages: gesorteerd,
  };
}
