import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalUpdatesOpIds } from "@/lib/sales/monday-client";

// Sales UX-ronde 3 (2026-08-14) — "Lees volledig" op het schooldetail-
// logboek. Haalt de volledige Monday-tekst van 1..N logboekregels ON-DEMAND
// op — nooit lokaal opgeslagen (de aanroeper, SalesSchooldetailView.tsx,
// houdt het resultaat uitsluitend in React-state zolang het item uitgeklapt
// is). Dit endpoint wordt UITSLUITEND door de mens-gerichte logboek-UI
// gebruikt — de AI-context-opbouw (lib/sales/context.ts, het nieuwe
// aggregate-chat.ts) roept dit nooit aan, zodat "wat Michel mag lezen" en
// "wat automatisch naar het AI-model gaat" gescheiden blijven (expliciete
// opdrachtseis).
//
// Schoolisolatie: de where-clause hieronder scoped ALTIJD op zowel de
// gevraagde log-event-ID's ALS de school uit de URL — een ID die (per
// ongeluk of opzettelijk) bij een andere school hoort levert simpelweg geen
// resultaat op, zelfde IDOR-veilige "nooit onderscheid tussen niet-bestaand
// en niet-van-jou"-patroon als de rest van lib/sales/*.
// 50 = zelfde bovengrens als de logboek-fetch zelf (SalesSchooldetailView.tsx
// haalt maximaal 50 regels op) — "Alles uitklappen" past dus altijd binnen één aanvraag.
const MAX_PER_AANVRAAG = 50;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schoolId = Number(id);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return NextResponse.json({ error: "Ongeldig school-ID." }, { status: 400 });
  }

  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  // Admin gebruikersbeheer (2026-08-25) — permissiecheck naast de bestaande rolcheck.
  if (!heeftAdminPermissie(sessieControle.user, "sales.scholen")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { logEventIds?: number[] };
    const logEventIds = Array.isArray(body.logEventIds) ? body.logEventIds.filter((n) => Number.isInteger(n) && n > 0) : [];
    if (logEventIds.length === 0) {
      return NextResponse.json({ error: "logEventIds is verplicht." }, { status: 400 });
    }
    if (logEventIds.length > MAX_PER_AANVRAAG) {
      return NextResponse.json({ error: `Maximaal ${MAX_PER_AANVRAAG} logboekregels per aanvraag.` }, { status: 400 });
    }

    const logEvents = await payload.find({
      collection: "sales-log-events",
      where: { id: { in: logEventIds }, school: { equals: schoolId } },
      limit: logEventIds.length,
      overrideAccess: true,
      depth: 0,
    });

    type LogEventDoc = { id: number; source: string; sourceExternalId?: string | null };
    const mondayEvents = (logEvents.docs as unknown as LogEventDoc[]).filter((e) => e.source === "monday" && e.sourceExternalId);
    if (mondayEvents.length === 0) {
      return NextResponse.json({ resultaten: [] });
    }

    const updates = await haalUpdatesOpIds(mondayEvents.map((e) => e.sourceExternalId!));
    const updatePerId = new Map(updates.map((u) => [u.id, u]));

    const resultaten = mondayEvents
      .map((e) => {
        const update = updatePerId.get(e.sourceExternalId!);
        if (!update) return null;
        return { logEventId: e.id, tekst: update.text_body, auteur: update.creator?.name ?? null };
      })
      .filter((r): r is { logEventId: number; tekst: string; auteur: string | null } => r !== null);

    return NextResponse.json({ resultaten });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/school/log-events/full-text] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
