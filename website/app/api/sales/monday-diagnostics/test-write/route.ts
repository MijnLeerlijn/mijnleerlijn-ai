import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { voerDiagnostischeSchrijfTest } from "@/lib/sales/monday-diagnostics";
import { SCHOLEN_KOLOM, TYPE_SCHOOL_WAARDEN, isSchrijfbareKolomId } from "@/lib/sales/monday-columns";

// Write-back-diagnose (2026-08-15) — de ENIGE plek die een echte testschrijving
// naar de productie-Monday-koppeling triggert vóór MONDAY_WRITEBACK_ENABLED
// aan staat (via forceerDiagnostisch, zie lib/sales/writeback.ts). Admin-only.
// Elke schrijving is één expliciete, door de admin zelf bevestigde actie —
// deze route doet zelf geen "automatisch nog een keer proberen" of iets
// dergelijks. columnId wordt hier opnieuw gevalideerd tegen de allowlist
// (nooit vertrouwen dat de client alleen de 3 toegestane ID's verstuurt),
// ook al bewaakt writeback.ts dit zelf ook al.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen voor beheerders." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { schoolId?: number; columnId?: string; testWaarde?: string; verwachteHuidigeWaarde?: string | null };

    const schoolId = Number(body.schoolId);
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      return NextResponse.json({ error: "Ongeldig school-ID." }, { status: 400 });
    }
    if (!body.columnId || !isSchrijfbareKolomId(body.columnId)) {
      return NextResponse.json({ error: "Ongeldige of niet-toegestane column-ID." }, { status: 400 });
    }
    if (!body.testWaarde || !body.testWaarde.trim()) {
      return NextResponse.json({ error: "testWaarde is verplicht." }, { status: 400 });
    }
    if (body.columnId === SCHOLEN_KOLOM.typeSchool && !(TYPE_SCHOOL_WAARDEN as readonly string[]).includes(body.testWaarde)) {
      return NextResponse.json({ error: `Ongeldige testwaarde voor Type school — moet exact een van ${TYPE_SCHOOL_WAARDEN.join(", ")} zijn.` }, { status: 400 });
    }

    const school = (await payload
      .findByID({ collection: "sales-schools", id: schoolId, overrideAccess: true, depth: 0 })
      .catch(() => null)) as unknown as { mondayItemId?: string } | null;
    if (!school || !school.mondayItemId) {
      return NextResponse.json({ error: "School niet gevonden." }, { status: 404 });
    }

    const resultaat = await voerDiagnostischeSchrijfTest(payload, {
      schoolId,
      mondayItemId: school.mondayItemId,
      columnId: body.columnId,
      verwachteHuidigeWaarde: body.verwachteHuidigeWaarde ?? null,
      testWaarde: body.testWaarde,
      actorId: sessieControle.user!.id,
    });
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/monday-diagnostics/test-write] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
