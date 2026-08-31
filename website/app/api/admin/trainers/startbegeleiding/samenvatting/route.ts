import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { genereerStartbegeleidingSamenvatting } from "@/lib/trainers/startbegeleiding";

// Startbegeleiding-ronde (2026-09-02, spec §D.14) — AI-samenvatting los van
// de schooldetail-GET (school/route.ts) i.p.v. daarin meegebakken: dit is de
// enige AI-aanroep op deze pagina, on-demand (zie lib/trainers/
// startbegeleiding.ts se eigen toelichting: "geen cachecollectie, lage-
// frequentie beheerhandeling") — een los endpoint laat de UI 'm expliciet
// via een knop laten genereren i.p.v. bij elke paginalading impliciet een
// AI-aanroep te doen.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.startbegeleiding")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  const schoolId = request.nextUrl.searchParams.get("id");
  if (!schoolId) {
    return NextResponse.json({ error: "Ongeldig of ontbrekend school-ID." }, { status: 400 });
  }

  try {
    const samenvatting = await genereerStartbegeleidingSamenvatting(schoolId);
    return NextResponse.json({ samenvatting });
  } catch (error) {
    console.error("[api/admin/trainers/startbegeleiding/samenvatting] genereren mislukt:", error);
    return NextResponse.json({ error: "Samenvatting genereren mislukt. Probeer het opnieuw." }, { status: 502 });
  }
}
