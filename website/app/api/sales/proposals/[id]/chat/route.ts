import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { stelVraagOverVoorstel, type ChatBericht } from "@/lib/sales/proposal-chat";

const MAX_GESCHIEDENIS = 30;

// Relatie-analyse V1.1 (2026-08-15) — "Bespreek met AI". Zelfde
// object-level-autorisatiereden als app/api/sales/school/[id]/chat/route.ts:
// een niet-bestaand voorstel-ID geeft altijd 404, nooit een ander record
// lekken via een generieke fout.
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

  try {
    const body = (await request.json()) as { vraag?: string; geschiedenis?: ChatBericht[] };
    if (!body.vraag || !body.vraag.trim()) {
      return NextResponse.json({ error: "vraag is verplicht." }, { status: 400 });
    }
    const geschiedenis = Array.isArray(body.geschiedenis) ? body.geschiedenis.slice(-MAX_GESCHIEDENIS) : [];

    const resultaat = await stelVraagOverVoorstel(payload, proposalId, body.vraag, geschiedenis);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/proposals/chat] mislukt:", boodschap);
    const status = boodschap.includes("niet gevonden") ? 404 : 500;
    return NextResponse.json({ error: boodschap }, { status });
  }
}
