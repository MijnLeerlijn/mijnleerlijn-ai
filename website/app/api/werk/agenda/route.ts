import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang, markeerGoogleConnectionGebruikt } from "@/lib/google-calendar/connection";
import { fetchPrimaryCalendar } from "@/lib/google-calendar/oauth";
import { fetchAgendaEventsInBereik, lokaleMiddernachtAlsUtc, volgendeDagIso } from "@/lib/google-calendar/api";

const DATUM_PATROON = /^\d{4}-\d{2}-\d{2}$/;

// Mijn Werk Fase 2 (2026-08-17) — live Calendar-events voor ÉÉN gekozen dag,
// de vierde bron van lib/werk/agenda.ts se bepaalWerkAgenda(). Pure read,
// geen bulkopslag van eventgegevens (uitsluitend lastUsedAt op de eigen
// koppeling bijgewerkt) — elke aanroep leest live bij Google, zelfde
// verifyAdminSessionCookie-patroon als app/api/werk/wachten-op.
//
// `connected: false` (geen koppeling, of een verlopen/ingetrokken
// toestemming — verkrijgGeldigeToegang levert in beide gevallen null) is een
// normale, verwachte staat (200, geen foutstatus) — de UI toont dan de
// koppel-CTA. Om "nog nooit gekoppeld" van "verlopen, opnieuw verbinden
// nodig" te onderscheiden voor de juiste CTA-tekst, leest de UI apart
// GET /api/google-connections (Payload's eigen native REST, ownRecordAccess-
// gescoped) — deze route houdt zich uitsluitend bezig met "geef me de
// events voor deze dag", geen connectie-statusnuance.
//
// Look-ahead-vensters voor voorbereidingssignalen lopen bewust via een
// APARTE route (app/api/werk/voorbereiding, lib/werk/voorbereiding.ts) —
// die kennen "vandaag" nodig, deze route uitsluitend de opgevraagde `datum`.
//
// Foutmeldingen naar de client blijven generiek (opdrachtseis "veilige
// foutmeldingen") — de echte fout (kan Google-responstekst bevatten) wordt
// uitsluitend server-side gelogd, nooit doorgegeven.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde gebruikers mogen dit." }, { status: 403 });
  }
  const user = sessieControle.user as AuthUser;

  const datum = request.nextUrl.searchParams.get("datum");
  if (!datum || !DATUM_PATROON.test(datum)) {
    return NextResponse.json({ error: "Ongeldige of ontbrekende datum (verwacht YYYY-MM-DD)." }, { status: 400 });
  }

  try {
    const toegang = await verkrijgGeldigeToegang(payload, user.id);
    if (!toegang) {
      return NextResponse.json({ connected: false, events: [] });
    }

    const { timeZone } = await fetchPrimaryCalendar(toegang.accessToken);
    const timeMin = lokaleMiddernachtAlsUtc(datum, timeZone).toISOString();
    const timeMax = lokaleMiddernachtAlsUtc(volgendeDagIso(datum), timeZone).toISOString();
    const { events } = await fetchAgendaEventsInBereik(toegang.accessToken, timeMin, timeMax);

    await markeerGoogleConnectionGebruikt(payload, toegang.connectionId);

    return NextResponse.json({ connected: true, events });
  } catch (error) {
    console.error("[api/werk/agenda] mislukt:", error);
    return NextResponse.json({ error: "Agenda kon niet worden opgehaald. Probeer het later opnieuw." }, { status: 500 });
  }
}
