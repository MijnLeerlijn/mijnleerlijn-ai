import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalAdminStartbegeleidingSchoolDetail } from "@/lib/admin/trainers/startbegeleiding";

// Startbegeleiding-ronde (2026-09-02, spec §D/§E) — schooldetail binnen
// Startbegeleiding: drill-down vanaf de scholenlijst (geen eigen
// nav-groups.ts-item, zelfde `?id=`-conventie als app/api/admin/trainers/
// school/route.ts — hier ook een Monday-item-ID, dus bewust een STRING).
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

  const detail = await haalAdminStartbegeleidingSchoolDetail(payload, schoolId);
  if (!detail) {
    return NextResponse.json({ error: "School niet gevonden (of valt niet meer onder Startbegeleiding)." }, { status: 404 });
  }
  return NextResponse.json(detail);
}
