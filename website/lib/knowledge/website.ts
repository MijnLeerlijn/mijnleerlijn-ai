// Eenvoudige tekstextractie voor URL-gebaseerde bronnen (website, release
// notes, handleiding, FAQ, intern document) — een kale fetch + tags strippen,
// geen headless browser/JS-rendering (bewust: "eenvoudig" houden, geen
// afhankelijkheid van een scraping-dienst voor deze sprint). Lokale, kleine
// implementatie i.p.v. lib/gmail/api.ts's htmlToPlainText() hergebruiken —
// dat bestand blijft Gmail-specifiek, geen kruisimport tussen domeinmodules.

const FETCH_TIMEOUT_MS = 15_000;

export interface WebsiteExtractieResultaat {
  title: string;
  text: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export async function fetchWebsiteText(url: string): Promise<WebsiteExtractieResultaat> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Kon URL niet ophalen (HTTP ${response.status}): ${url}`);
    }
    const html = await response.text();
    const titelMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return {
      title: titelMatch?.[1]?.trim() ?? url,
      text: stripHtml(html),
    };
  } finally {
    clearTimeout(timeout);
  }
}
