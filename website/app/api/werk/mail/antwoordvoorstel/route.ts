import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalSignaalVoorAntwoord } from "@/lib/werk/mail-signalen";
import { genereerAntwoordvoorstel } from "@/lib/werk/mail-reply";
import { maakRateLimiter } from "@/lib/contact/validate";

const DATUM_PATROON = /^\d{4}-\d{2}-\d{2}$/;

// Vijf per minuut per gebruiker — zelfde rate-limitconventie als
// app/api/werk/voorbereiding/ai-voorstel (expliciete-klik-only, dure
// AI-aanroep die bovendien de volledige mailinhoud leest).
const beperkAanvragen = maakRateLimiter(60_000, 5);

interface Body {
  signaalId?: number;
  /** YYYY-MM-DD, client-lokaal — bepaalt het beschikbaarheidsvenster in het voorstel (zie lib/werk/mail-reply.ts). */
  vandaag?: string;
}

// Mijn Werk Fase 3 (2026-08-17) — "Maak antwoordvoorstel". Uitsluitend na
// deze expliciete klik leest de AI de volledige e-mail (en evt. thread) —
// zie lib/werk/mail-reply.ts voor de ONVERTROUWD-labeling en
// contextopbouw. Slaat niets van de mailinhoud of het concept op.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde gebruikers mogen dit." }, { status: 403 });
  }
  const user = sessieControle.user as AuthUser;

  if (!beperkAanvragen.magVerder(String(user.id))) {
    return NextResponse.json({ error: "Te veel aanvragen — probeer het over een minuut opnieuw." }, { status: 429 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  if (typeof body.signaalId !== "number" || !body.vandaag || !DATUM_PATROON.test(body.vandaag)) {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    const signaal = await haalSignaalVoorAntwoord(payload, user.id, body.signaalId);
    if (!signaal) {
      return NextResponse.json({ error: "Signaal niet gevonden." }, { status: 404 });
    }

    const voorstel = await genereerAntwoordvoorstel(payload, {
      eigenaarId: user.id,
      gmailMessageId: signaal.gmailMessageId,
      schoolId: signaal.schoolId,
      vandaag: body.vandaag,
    });

    return NextResponse.json({ voorstel });
  } catch (error) {
    console.error("[api/werk/mail/antwoordvoorstel] mislukt:", error);
    return NextResponse.json({ error: "Antwoordvoorstel kon niet worden gegenereerd. Probeer het opnieuw." }, { status: 500 });
  }
}
