// Payload geeft Media.url terug als ABSOLUTE URL (serverURL + pad, bv.
// "http://localhost:3300/api/media/file/x.png" of in productie het echte
// domein) — next/image behandelt een absolute URL altijd als "remote" en
// vereist dan een exacte hostname-allowlist in next.config.ts, die per
// omgeving zou verschillen. Alle Handleidingbouwer-stapafbeeldingen lopen
// sowieso via de eigen /api/media/file/-proxyroute (nooit rechtstreeks een
// externe Blob-URL, zie lib/knowledge/delete-handleiding.ts), dus een
// relatief pad is hier altijd correct en werkt ongeacht omgeving/domein
// zonder config.
export function naarRelatiefMediaPad(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
