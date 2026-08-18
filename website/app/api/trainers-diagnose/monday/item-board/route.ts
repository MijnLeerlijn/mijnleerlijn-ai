import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { zoekItemMetBoard, MONDAY_ID_PATROON } from "@/lib/trainers-diagnose/monday-readonly";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving — read-only Monday-diagnose (2026-08-19). Zie
// lib/trainers-diagnose/monday-readonly.ts se moduletoelichting.
// Beantwoordt C/D: herleidt een item-ID (bijv. gevonden in een
// board_relation-kolomwaarde op het trainerboard) naar het echte board waar
// dat item bij hoort — bevestigt of een Master ID-kandidaatkolom
// daadwerkelijk naar "1: Scholen (Master Data)" wijst, en ontdekt zo het
// board-ID van "8: Contactpersonen".
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
    const body = (await request.json().catch(() => ({}))) as { itemId?: string };
    if (!body.itemId || !MONDAY_ID_PATROON.test(body.itemId)) {
      return NextResponse.json({ error: "Ongeldig item-ID." }, { status: 400 });
    }

    const item = await zoekItemMetBoard(body.itemId);
    if (!item) {
      return NextResponse.json({ error: "Item niet gevonden of niet bereikbaar met dit token." }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/trainers-diagnose/monday/item-board] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
