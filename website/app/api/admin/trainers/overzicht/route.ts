import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalAdminTrainersOverzicht } from "@/lib/admin/trainers/overzicht";

// Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdashboard (spec §2).
// Zelfde verifyAdminSessionCookie/isEditor-patroon als elke andere admin-
// route in dit project (o.a. app/api/admin/trainer-kennis/herindexeer) — een
// traineraccount-sessiecookie (ander mechanisme, ander cookie/collection-claim,
// zie lib/auth/verify-session.ts) faalt hier altijd, ongeacht welke waarde
// die cookie draagt.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  const overzicht = await haalAdminTrainersOverzicht(payload);
  return NextResponse.json(overzicht);
}
