import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { genereerEnCacheSchoolSamenvatting } from "@/lib/sales/school-summary";

// Sales UX V2 (2026-08-14) — handmatige "Vernieuwen" op het schooldetail.
// De automatische cache-verversing loopt via lib/sales/sync.ts (na nieuwe,
// betrouwbare Monday-activiteit) — deze route is uitsluitend de expliciete,
// door de gebruiker gekozen uitzondering daarop.
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

    const samenvatting = await genereerEnCacheSchoolSamenvatting(payload, schoolId);
    return NextResponse.json({ samenvatting, gegenereerdOp: new Date().toISOString() });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/school/summary] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
