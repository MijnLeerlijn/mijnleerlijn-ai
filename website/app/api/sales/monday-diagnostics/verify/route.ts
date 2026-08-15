import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verifieerMondayKoppeling } from "@/lib/sales/monday-diagnostics";

// Write-back-diagnose (2026-08-15) — read-only, admin-only (isAdmin, strenger
// dan de isEditor die de rest van Sales gebruikt: dit raakt de echte
// productie-Monday-koppeling). Doet nooit een schrijfpoging. schoolId is
// optioneel — zonder schoolId bevestigt dit alleen dat het board/de 3
// kolommen bestaan; mét schoolId (server-side omgezet naar mondayItemId, nooit
// een los, door de client meegegeven Monday-item-ID) worden ook de huidige
// waarden van dat ene, bestaande, getrackte schoolitem gelezen.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen voor beheerders." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { schoolId?: number };
    let mondayItemId: string | undefined;

    if (body.schoolId !== undefined) {
      const schoolId = Number(body.schoolId);
      if (!Number.isInteger(schoolId) || schoolId <= 0) {
        return NextResponse.json({ error: "Ongeldig school-ID." }, { status: 400 });
      }
      const school = (await payload
        .findByID({ collection: "sales-schools", id: schoolId, overrideAccess: true, depth: 0 })
        .catch(() => null)) as unknown as { mondayItemId?: string } | null;
      if (!school) {
        return NextResponse.json({ error: "School niet gevonden." }, { status: 404 });
      }
      mondayItemId = school.mondayItemId;
    }

    const resultaat = await verifieerMondayKoppeling(mondayItemId);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/monday-diagnostics/verify] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
