import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { voerDiagnostischeTerugzetting } from "@/lib/sales/monday-diagnostics";
import { SCHOLEN_KOLOM, TYPE_SCHOOL_WAARDEN, isSchrijfbareKolomId } from "@/lib/sales/monday-columns";

// Write-back-diagnose (2026-08-15) — zet een kolom terug naar de waarde van
// vóór een testschrijving (voerDiagnostischeTerugzetting, hetzelfde veilige
// pad als test-write). Admin-only, zelfde validatie als test-write.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen voor beheerders." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { schoolId?: number; columnId?: string; oorspronkelijkeWaarde?: string | null; verwachteHuidigeWaarde?: string | null };

    const schoolId = Number(body.schoolId);
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      return NextResponse.json({ error: "Ongeldig school-ID." }, { status: 400 });
    }
    if (!body.columnId || !isSchrijfbareKolomId(body.columnId)) {
      return NextResponse.json({ error: "Ongeldige of niet-toegestane column-ID." }, { status: 400 });
    }
    const oorspronkelijkeWaarde = body.oorspronkelijkeWaarde ?? null;
    if (oorspronkelijkeWaarde !== null && body.columnId === SCHOLEN_KOLOM.typeSchool && !(TYPE_SCHOOL_WAARDEN as readonly string[]).includes(oorspronkelijkeWaarde)) {
      return NextResponse.json({ error: `Ongeldige oorspronkelijke waarde voor Type school — moet exact een van ${TYPE_SCHOOL_WAARDEN.join(", ")} zijn.` }, { status: 400 });
    }

    const school = (await payload
      .findByID({ collection: "sales-schools", id: schoolId, overrideAccess: true, depth: 0 })
      .catch(() => null)) as unknown as { mondayItemId?: string } | null;
    if (!school || !school.mondayItemId) {
      return NextResponse.json({ error: "School niet gevonden." }, { status: 404 });
    }

    const resultaat = await voerDiagnostischeTerugzetting(payload, {
      schoolId,
      mondayItemId: school.mondayItemId,
      columnId: body.columnId,
      oorspronkelijkeWaarde,
      verwachteHuidigeWaarde: body.verwachteHuidigeWaarde ?? null,
      actorId: sessieControle.user!.id,
    });
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/monday-diagnostics/revert] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
