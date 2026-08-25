import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, type AuthUser } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalUpdatesVoorItem } from "@/lib/sales/monday-client";
import { MAX_UPDATES, MONDAY_ID_PATROON } from "@/lib/trainers-diagnose/monday-readonly";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving — read-only Monday-diagnose (2026-08-19). Zie
// lib/trainers-diagnose/monday-readonly.ts se moduletoelichting.
// Beantwoordt D ("waar staan Updates/logboekberichten") — hergebruikt
// rechtstreeks de al bestaande, board-onafhankelijke haalUpdatesVoorItem()
// (lib/sales/monday-client.ts, tot nu toe alleen door de school-AI/
// verrijking gebruikt). Werkt voor élk item-ID: een trainingsitem/subitem
// (waar zit het trainingsverslag?) ÉN een Master Data-schoolitem (waar zit
// het centrale schoollogboek? — plak daarvoor een bestaande
// sales-schools.mondayItemId in itemId).
const beperkAanvragen = maakRateLimiter(60_000, 10);

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen voor beheerders." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.dashboard")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }
  const user = sessieControle.user as AuthUser;

  if (!beperkAanvragen.magVerder(String(user.id))) {
    return NextResponse.json({ error: "Te veel aanvragen — probeer het over een minuut opnieuw." }, { status: 429 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { itemId?: string; limit?: number };
    if (!body.itemId || !MONDAY_ID_PATROON.test(body.itemId)) {
      return NextResponse.json({ error: "Ongeldig item-ID." }, { status: 400 });
    }
    const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, MAX_UPDATES) : MAX_UPDATES;

    const updates = await haalUpdatesVoorItem(body.itemId, limit);
    return NextResponse.json({ updates });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/trainers-diagnose/monday/updates] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
