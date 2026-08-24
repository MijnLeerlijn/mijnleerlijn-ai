import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import {
  haalAdminSchoolBasis,
  haalAdminSchoolAandacht,
  haalAdminSchoolOverzichtTab,
  haalAdminSchoolTrainersTab,
  haalAdminSchoolTrainingenTab,
  haalAdminSchoolVerslagenTab,
  haalAdminSchoolLogboekTab,
  haalAdminSchoolBestandenTab,
} from "@/lib/admin/trainers/schooldetail";

// Traineromgeving V2, Fase 5 (2026-08-24) — Admin Schooldetail (spec §1).
// Zelfde statisch-pad-plus-`?id=`/`?tab=`-conventie als
// app/api/admin/trainers/detail/route.ts — hier is `id` bewust een STRING
// (het Monday-item-ID van de school in Master Data), nooit een Number()-cast:
// scholen leven in Monday, niet in Payload, dus er is geen numeriek
// Payload-ID om naar te casten (in tegenstelling tot trainerId hierboven).
const TABS = ["basis", "aandacht", "overzicht", "trainers", "trainingen", "verslagen", "logboek", "bestanden"] as const;
type Tab = (typeof TABS)[number];

function isTab(waarde: string | null): waarde is Tab {
  return TABS.includes(waarde as Tab);
}

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  const schoolId = request.nextUrl.searchParams.get("id");
  if (!schoolId) {
    return NextResponse.json({ error: "Ongeldig of ontbrekend school-ID." }, { status: 400 });
  }

  const tabRaw = request.nextUrl.searchParams.get("tab") ?? "basis";
  if (!isTab(tabRaw)) {
    return NextResponse.json({ error: "Ongeldig tabblad." }, { status: 400 });
  }

  const uitkomst = await (async () => {
    switch (tabRaw) {
      case "basis":
        return haalAdminSchoolBasis(payload, schoolId);
      case "aandacht":
        return haalAdminSchoolAandacht(payload, schoolId);
      case "overzicht":
        return haalAdminSchoolOverzichtTab(payload, schoolId);
      case "trainers":
        return haalAdminSchoolTrainersTab(payload, schoolId);
      case "trainingen":
        return haalAdminSchoolTrainingenTab(payload, schoolId);
      case "verslagen":
        return haalAdminSchoolVerslagenTab(payload, schoolId);
      case "logboek":
        return haalAdminSchoolLogboekTab(payload, schoolId);
      case "bestanden":
        return haalAdminSchoolBestandenTab(payload, schoolId);
    }
  })();

  if (uitkomst.soort === "niet_gevonden") {
    return NextResponse.json({ error: "School niet gevonden." }, { status: 404 });
  }
  return NextResponse.json(uitkomst.data);
}
