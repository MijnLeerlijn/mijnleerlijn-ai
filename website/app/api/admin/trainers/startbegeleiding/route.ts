import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalAdminStartbegeleidingScholen } from "@/lib/admin/trainers/startbegeleiding";

// Startbegeleiding-ronde (2026-09-02, spec §D.13) — scholenlijst voor de
// nieuwe admin-pagina "Startbegeleiding": scholen uit Monday met salesstatus
// "Wacht op handtekening"/"Klant" (STARTBEGELEIDING_STATUSSEN, lib/trainers/
// startbegeleiding.ts), verrijkt met trainernamen + open-actietelling. Zelfde
// auth-/permissiepatroon als elke andere app/api/admin/trainers/*-route.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.startbegeleiding")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  const scholen = await haalAdminStartbegeleidingScholen(payload);
  return NextResponse.json({ scholen });
}
