import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { fetchAgendaEventById } from "@/lib/google-calendar/api";
import { matchSchoolBetrouwbaar, type SchoolOptie } from "@/lib/werk/school-matching";
import { genereerVoorbereidingsvoorstel } from "@/lib/werk/voorbereiding-ai";
import { maakRateLimiter } from "@/lib/contact/validate";

// Vijf per minuut per gebruiker — dit is een expliciete-klik-only, dure
// AI-aanroep (geen dashboard-refresh-pad, zie lib/werk/voorbereiding-ai.ts),
// maar had als enige nieuwe AI-route in dit project nog GEEN rate limiting
// (opdrachtseis + bestaand gat: tot Fase 2 had geen enkel ingelogd
// AI-endpoint een limiter, zie lib/contact/validate.ts se eigen toelichting
// — dit is de eerste keer dat een ingelogde AI-route dit patroon krijgt).
const beperkAanvragen = maakRateLimiter(60_000, 5);

interface Body {
  eventId?: string;
  /** Optioneel — een expliciete "School koppelen"-keuze van de gebruiker (bij twijfel), overschrijft de automatische matching. */
  schoolId?: number | null;
}

// Mijn Werk Fase 2 (2026-08-17) — het AI-voorbereidingsvoorstel, uitsluitend
// na een expliciete klik. Haalt het event OPNIEUW, gezaghebbend, rechtstreeks
// bij Google op (nooit de client se eigen titel/beschrijving vertrouwen voor
// de AI-prompt) — dit is ook de enige plek in Fase 2 die een eventbeschrijving
// opvraagt (zie lib/google-calendar/api.ts se fetchAgendaEventById), nooit
// bij het gewone dagoverzicht.
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
  if (!body.eventId) {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    const toegang = await verkrijgGeldigeToegang(payload, user.id);
    if (!toegang) {
      return NextResponse.json({ error: "Geen actieve Google Agenda-koppeling." }, { status: 409 });
    }

    const event = await fetchAgendaEventById(toegang.accessToken, body.eventId);
    if (!event) {
      return NextResponse.json({ error: "Dit agenda-event is niet meer beschikbaar." }, { status: 404 });
    }

    let schoolId: number | null = null;
    if (typeof body.schoolId === "number") {
      // Expliciete, door de gebruiker bevestigde koppeling ("School koppelen") — bestaan verifiëren, nooit blind vertrouwen op een client-ID.
      const school = await payload
        .findByID({ collection: "sales-schools", id: body.schoolId, overrideAccess: true, depth: 0 })
        .catch(() => null);
      if (school) schoolId = body.schoolId;
    } else {
      const scholenResultaat = await payload.find({
        collection: "sales-schools",
        where: { actief: { not_equals: false } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      });
      const scholen: SchoolOptie[] = (scholenResultaat.docs as unknown as { id: number; schoolName: string }[]).map((s) => ({
        id: s.id,
        schoolName: s.schoolName,
      }));
      const match = matchSchoolBetrouwbaar(`${event.titel} ${event.beschrijving ?? ""}`, scholen);
      schoolId = match.school?.id ?? null;
    }

    const voorstel = await genereerVoorbereidingsvoorstel(payload, {
      eventTitel: event.titel,
      eventBeschrijving: event.beschrijving,
      eventDatum: event.datum,
      eventTijd: event.tijd,
      volledigeDag: event.volledigeDag,
      schoolId,
    });

    return NextResponse.json({ voorstel, schoolId });
  } catch (error) {
    console.error("[api/werk/voorbereiding/ai-voorstel] mislukt:", error);
    return NextResponse.json({ error: "Voorbereidingsvoorstel kon niet worden gegenereerd. Probeer het opnieuw." }, { status: 500 });
  }
}
