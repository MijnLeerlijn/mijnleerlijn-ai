import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { fetchPrimaryCalendar } from "@/lib/google-calendar/oauth";
import { fetchAgendaEventsInBereik, lokaleMiddernachtAlsUtc, volgendeDagIso } from "@/lib/google-calendar/api";
import { haalVoorbereidingSignalen, PREP_LOOKAHEAD_DAGEN } from "@/lib/werk/voorbereiding";
import type { SchoolOptie } from "@/lib/werk/school-matching";

const DATUM_PATROON = /^\d{4}-\d{2}-\d{2}$/;

// Mijn Werk Fase 2 (2026-08-17) — voorbereidingssignalen voor de komende
// PREP_LOOKAHEAD_DAGEN dagen (standaard 2-3, zie lib/werk/voorbereiding.ts).
// `vandaag` komt van de client (zelfde vandaagIso() als de rest van het
// dashboard al gebruikt) i.p.v. hier opnieuw "vandaag" te bepalen — anders
// zou een browser-lokale dag en een servergebaseerde dag uit elkaar kunnen
// lopen rond middernacht.
//
// `connected: false` (geen/verlopen koppeling) is een normale 200-staat,
// zelfde reden als app/api/werk/agenda. Foutmeldingen naar de client blijven
// generiek — de gedetailleerde fout wordt uitsluitend server-side gelogd.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde gebruikers mogen dit." }, { status: 403 });
  }
  const user = sessieControle.user as AuthUser;

  const vandaag = request.nextUrl.searchParams.get("vandaag");
  if (!vandaag || !DATUM_PATROON.test(vandaag)) {
    return NextResponse.json({ error: "Ongeldige of ontbrekende datum (verwacht YYYY-MM-DD)." }, { status: 400 });
  }

  try {
    const toegang = await verkrijgGeldigeToegang(payload, user.id);
    if (!toegang) {
      return NextResponse.json({ connected: false, signalen: [] });
    }

    const { timeZone } = await fetchPrimaryCalendar(toegang.accessToken);
    let eindDatum = vandaag;
    for (let i = 0; i < PREP_LOOKAHEAD_DAGEN; i++) eindDatum = volgendeDagIso(eindDatum);
    const timeMin = lokaleMiddernachtAlsUtc(vandaag, timeZone).toISOString();
    const timeMax = lokaleMiddernachtAlsUtc(eindDatum, timeZone).toISOString();
    const { events } = await fetchAgendaEventsInBereik(toegang.accessToken, timeMin, timeMax);

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

    const signalen = await haalVoorbereidingSignalen(payload, user.id, events, scholen, vandaag);

    return NextResponse.json({ connected: true, signalen });
  } catch (error) {
    console.error("[api/werk/voorbereiding] mislukt:", error);
    return NextResponse.json({ error: "Voorbereidingssignalen konden niet worden opgehaald." }, { status: 500 });
  }
}
