import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { stelMijnWerkVraag } from "@/lib/werk/mijn-werk-chat";
import { maakRateLimiter } from "@/lib/contact/validate";

const DATUM_PATROON = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VRAAG_LENGTE = 500;

// Twintig per 10 minuten per gebruiker — zelfde orde van grootte als
// app/api/helpdesk/ask (publiek, dus voorzichtiger) maar hier ingelogd en
// bedoeld voor herhaald gebruik in een lopend gesprek, dus iets ruimer dan
// de éénmalige AI-voorstel-actie (5/min, zie .../voorbereiding/ai-voorstel).
const beperkAanvragen = maakRateLimiter(10 * 60 * 1000, 20);

interface Body {
  vraag?: string;
  vandaag?: string;
}

// Mijn Werk Fase 2 (2026-08-17) — nieuw pad voor de "Mijn Werk"-vraagmodus
// van de Vraag-tab (naast, niet i.p.v., de bestaande "Alle scholen"/
// specifieke-school-opties — zie SalesDashboardPaneel.tsx). Routering +
// contextopbouw staan in lib/werk/context-router.ts / lib/werk/mijn-werk-chat.ts.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde gebruikers mogen dit." }, { status: 403 });
  }
  const user = sessieControle.user as AuthUser;

  if (!beperkAanvragen.magVerder(String(user.id))) {
    return NextResponse.json({ error: "Te veel vragen achter elkaar. Probeer het over een paar minuten opnieuw." }, { status: 429 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const vraag = body.vraag?.trim();
  if (!vraag || vraag.length > MAX_VRAAG_LENGTE) {
    return NextResponse.json({ error: "Ongeldige vraag." }, { status: 400 });
  }
  if (!body.vandaag || !DATUM_PATROON.test(body.vandaag)) {
    return NextResponse.json({ error: "Ongeldige of ontbrekende datum." }, { status: 400 });
  }

  try {
    const { antwoord, categorie } = await stelMijnWerkVraag(payload, user.id, vraag, body.vandaag);
    return NextResponse.json({ antwoord, categorie });
  } catch (error) {
    console.error("[api/werk/chat] mislukt:", error);
    return NextResponse.json({ error: "Vraag stellen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
