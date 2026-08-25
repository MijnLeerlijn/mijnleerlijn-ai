import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, type AuthUser } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { analyseerBoardRelaties, MONDAY_ID_PATROON } from "@/lib/trainers-diagnose/monday-readonly";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving — read-only Monday-diagnose (2026-08-19, uitgebreid
// 2026-08-19 met Connect Boards-/mirror-relatieanalyse). Zie lib/trainers-
// diagnose/monday-readonly.ts se moduletoelichting. Beantwoordt specifiek de
// relatiearchitectuur tussen persoonlijke trainerboards, "4: Uitvoering
// (Trainingen)", "1: Scholen (Master Data)", "8: Contactpersonen" en "5:
// Uitvoerder training" — welke board_relation-kolommen naar welke doelboards
// wijzen, een heuristische bidirectioneel-inschatting, en welke mirror-
// kolommen van welke relatie afhankelijk zijn. Nooit een schrijfpoging.
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
    const body = (await request.json().catch(() => ({}))) as { boardId?: string };
    if (!body.boardId || !MONDAY_ID_PATROON.test(body.boardId)) {
      return NextResponse.json({ error: "Ongeldig board-ID." }, { status: 400 });
    }

    const analyse = await analyseerBoardRelaties(body.boardId);
    if (!analyse) {
      return NextResponse.json({ error: "Board niet gevonden of niet bereikbaar met dit token." }, { status: 404 });
    }
    return NextResponse.json({ analyse });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/trainers-diagnose/monday/relations] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
