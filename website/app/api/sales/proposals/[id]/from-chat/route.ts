import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { maakVoorstelUitOverleg, type ChatBericht } from "@/lib/sales/proposal-chat";

const MAX_GESCHIEDENIS = 30;

// Relatie-analyse V1.1 (2026-08-15) — "Maak hiervan nieuw voorstel": pas HIER
// (niet tijdens het chatten) verandert de sales-proposals-data — precies de
// opdrachtseis "chat is gesprek, voorstel is resultaat".
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    return NextResponse.json({ error: "Ongeldig voorstel-ID." }, { status: 400 });
  }

  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  // Admin gebruikersbeheer (2026-08-25) — permissiecheck naast de bestaande rolcheck.
  if (!heeftAdminPermissie(sessieControle.user, "sales.overzicht")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { geschiedenis?: ChatBericht[] };
    const geschiedenis = Array.isArray(body.geschiedenis) ? body.geschiedenis.slice(-MAX_GESCHIEDENIS) : [];
    if (geschiedenis.length === 0) {
      return NextResponse.json({ error: "geschiedenis is verplicht." }, { status: 400 });
    }

    const resultaat = await maakVoorstelUitOverleg(payload, proposalId, geschiedenis, sessieControle.user!.id);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/proposals/from-chat] mislukt:", boodschap);
    const status = boodschap.includes("niet gevonden") ? 404 : 500;
    return NextResponse.json({ error: boodschap }, { status });
  }
}
