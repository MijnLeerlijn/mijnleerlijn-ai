import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { stelVraagOverSchool } from "@/lib/sales/school-chat";

// Sales-assistent V1 (2026-08-14) — "Vraag AI over deze school". Object-level
// autorisatie: een niet-numerieke of niet-bestaande school-ID geeft altijd
// 404, nooit een school van iemand anders lekken via een generieke fout (er
// bestaat geen per-editor schooltoewijzing in dit project — elke editor mag
// elke school zien, zelfde vlakke rolmodel als de rest van de admin — het
// risico hier is dus IDOR naar een NIET-bestaand/verkeerd record, niet
// cross-editor-scheiding).
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

  try {
    const bestaat = await payload.findByID({ collection: "sales-schools", id: schoolId, overrideAccess: true, depth: 0 }).catch(() => null);
    if (!bestaat) {
      return NextResponse.json({ error: "School niet gevonden." }, { status: 404 });
    }

    const body = (await request.json()) as { vraag?: string };
    if (!body.vraag || !body.vraag.trim()) {
      return NextResponse.json({ error: "vraag is verplicht." }, { status: 400 });
    }

    const resultaat = await stelVraagOverSchool(payload, schoolId, body.vraag);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/school/chat] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
