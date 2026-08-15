import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { stelOnderwijstypeHandmatigIn } from "@/lib/sales/education-type-manual";

// Relatie-analyse V1.1 (2026-08-15) — "Onderwijstype zelf instellen".
// Bevestiging is altijd expliciet (deze route wordt alleen aangeroepen na
// een gebruikersklik, nooit automatisch). Schrijft naar Monday via de
// bestaande, geteste write-back-service (conflictveilig, geaudit) — de
// lokale sales-schools.onderwijstype verandert uitsluitend als die
// write-back daadwerkelijk gelukt is (zie lib/sales/education-type-manual.ts).
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
    const body = (await request.json()) as { variantId?: number };
    const variantId = Number(body.variantId);
    if (!Number.isInteger(variantId) || variantId <= 0) {
      return NextResponse.json({ error: "variantId is verplicht." }, { status: 400 });
    }

    const resultaat = await stelOnderwijstypeHandmatigIn(payload, schoolId, variantId, sessieControle.user!.id);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/school/education-type] mislukt:", boodschap);
    const status = boodschap.includes("niet gevonden") ? 404 : 500;
    return NextResponse.json({ error: boodschap }, { status });
  }
}
