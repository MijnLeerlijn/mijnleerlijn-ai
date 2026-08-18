import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalBoardStructuur, MAX_ITEMS_PER_BOARD, MONDAY_ID_PATROON } from "@/lib/trainers-diagnose/monday-readonly";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving — read-only Monday-diagnose (2026-08-19). Zie
// lib/trainers-diagnose/monday-readonly.ts se moduletoelichting. Beantwoordt
// B/C/D van het architectuuronderzoek voor één board tegelijk: groepen,
// kolommen (id+titel+type), en een begrensde paginalijst items+subitems met
// hun ruwe column_values — nooit een schrijfpoging.
const beperkAanvragen = maakRateLimiter(60_000, 10);

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen voor beheerders." }, { status: 403 });
  }
  const user = sessieControle.user as AuthUser;

  if (!beperkAanvragen.magVerder(String(user.id))) {
    return NextResponse.json({ error: "Te veel aanvragen — probeer het over een minuut opnieuw." }, { status: 429 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { boardId?: string; itemsLimit?: number };
    if (!body.boardId || !MONDAY_ID_PATROON.test(body.boardId)) {
      return NextResponse.json({ error: "Ongeldig board-ID." }, { status: 400 });
    }
    const itemsLimit = typeof body.itemsLimit === "number" && body.itemsLimit > 0 ? Math.min(body.itemsLimit, MAX_ITEMS_PER_BOARD) : undefined;

    const structuur = await haalBoardStructuur(body.boardId, itemsLimit);
    if (!structuur) {
      return NextResponse.json({ error: "Board niet gevonden of niet bereikbaar met dit token." }, { status: 404 });
    }
    return NextResponse.json({ structuur });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/trainers-diagnose/monday/board] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
