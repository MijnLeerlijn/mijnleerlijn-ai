// Transcript ophalen voor video-bronnen — bewust ALLEEN het "eenvoudige" pad
// zoals gevraagd: als de video-URL zelf rechtstreeks platte tekst/VTT/SRT
// teruggeeft (bv. een losse ondertitelbestand-link), gebruiken we die tekst.
// Er wordt NIET geprobeerd ondertitels van YouTube/Vimeo/etc. te scrapen —
// dat is fragiel, vaak in strijd met de voorwaarden van die platformen, en
// expliciet buiten scope ("Transcript ophalen hoeft alleen als dat eenvoudig
// kan"). Zonder eenvoudig ophaalbaar transcript blijft het transcript-veld
// leeg (of het handmatig ingevulde veld blijft ongewijzigd) en vult de AI de
// samenvatting op basis van titel + omschrijving.

const FETCH_TIMEOUT_MS = 15_000;
const TEKST_EXTENSIES = [".vtt", ".srt", ".txt"];

// text/html is uitgesloten: dat is een gewone (video-)webpagina, geen
// transcript — anders zou elke video-URL hier per ongeluk als "eenvoudig
// ophaalbaar" worden gezien.
const TEKST_CONTENT_TYPES = ["text/plain", "text/vtt", "application/x-subrip"];

function isVermoedelijkTekstbestand(url: string, contentType: string | null): boolean {
  if (contentType && TEKST_CONTENT_TYPES.some((t) => contentType.toLowerCase().startsWith(t))) return true;
  const zonderQuery = url.split(/[?#]/)[0]?.toLowerCase() ?? "";
  return TEKST_EXTENSIES.some((ext) => zonderQuery.endsWith(ext));
}

function stripVttSrtOpmaak(tekst: string): string {
  return tekst
    .split("\n")
    .filter((regel) => {
      const r = regel.trim();
      if (!r) return false;
      if (r === "WEBVTT") return false;
      if (/^\d+$/.test(r)) return false; // SRT-volgnummers
      if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(r)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchTranscriptIfEasy(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type");
    if (!isVermoedelijkTekstbestand(url, contentType)) return null;
    const tekst = await response.text();
    const schoon = stripVttSrtOpmaak(tekst);
    return schoon.length > 0 ? schoon : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
