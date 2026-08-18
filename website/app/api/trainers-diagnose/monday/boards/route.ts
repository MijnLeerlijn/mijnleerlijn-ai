import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { lijstAlleBoards, MAX_BOARDS } from "@/lib/trainers-diagnose/monday-readonly";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving — read-only Monday-diagnose (2026-08-19). TIJDELIJK, zie
// lib/trainers-diagnose/monday-readonly.ts se moduletoelichting voor de
// volledige opruimlijst. Admin-only (isAdmin, niet isEditor — zelfde
// striktere grens als lib/sales/monday-diagnostics.ts: dit raakt de echte,
// gedeelde Monday-workspacetoken). Nooit een mutatie. Rate limiter beschermt
// het GEDEELDE Monday-ratebudget (dezelfde token als de echte Sales-sync)
// tegen een op hol geslagen diagnoseklik — geen bestaand precedent voor
// deze specifieke route dus bewust een expliciete keuze, geen kopie van een
// eerdere limiet.
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
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, MAX_BOARDS) : undefined;

    const boards = await lijstAlleBoards(limit);
    return NextResponse.json({ boards });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/trainers-diagnose/monday/boards] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
