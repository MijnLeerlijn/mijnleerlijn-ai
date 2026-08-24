import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { trekDeelLinkIn } from "@/lib/helpdesk/delen";
import { maakRateLimiter } from "@/lib/contact/validate";

// Chat delen via URL (2026-08-24) — publiek, geen login (zelfde reden als
// app/api/helpdesk/delen/route.ts): wie de ruwe token bezit (bv. de persoon
// die de link net zelf aanmaakte, via de lijst in de eigen browser) mag hem
// intrekken. Idempotent: een al ingetrokken of onbestaande token levert
// hetzelfde resultaat op — geen aparte foutmelding die het bestaan van een
// token zou bevestigen/ontkennen.
const rateLimiter = maakRateLimiter(10 * 60 * 1000, 20);

function klantIp(request: NextRequest): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "onbekend"
  );
}

export async function POST(request: NextRequest) {
  const ip = klantIp(request);
  if (!rateLimiter.magVerder(ip)) {
    return NextResponse.json({ error: "Te veel pogingen. Probeer het straks opnieuw." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { token } = (body ?? {}) as { token?: unknown };

  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "token is verplicht." }, { status: 400 });
  }

  try {
    const payload = await getPayload({ config });
    await trekDeelLinkIn(payload, token.trim());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/helpdesk/delen/intrekken] Intrekken mislukt:", error);
    return NextResponse.json({ error: "Intrekken is nu niet mogelijk. Probeer het later opnieuw." }, { status: 500 });
  }
}
