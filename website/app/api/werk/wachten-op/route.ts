import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { bepaalWachtenOp } from "@/lib/werk/wachten-op";

// Mijn Werk V1 (2026-08-17) — "Wachten op"-tab op het dashboard. Pure read,
// geen nevenerffecten — GET, zelfde patroon als
// app/api/sales/dashboard/todo/route.ts en app/api/sales/sync/status/route.ts
// (verifyAdminSessionCookie i.p.v. payload.auth(), zie lib/auth/
// verify-session.ts voor de reden). De daadwerkelijke selectie (uitsluitend
// bestaande Sales-data) staat in lib/werk/wachten-op.ts.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const items = await bepaalWachtenOp(payload);
    return NextResponse.json({ items });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/werk/wachten-op] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
