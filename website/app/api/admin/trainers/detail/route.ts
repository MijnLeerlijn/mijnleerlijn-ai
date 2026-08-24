import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import {
  haalAdminTrainerBasis,
  haalAdminTrainerOverzichtTab,
  haalAdminTrainerScholenTab,
  haalAdminTrainerTrainingenTab,
  haalAdminTrainerVerslagenTab,
  haalAdminTrainerLogboekTab,
  haalAdminTrainerTelefonieTab,
  haalAdminTrainerBestandenTab,
} from "@/lib/admin/trainers/trainerdetail";

// Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdetail (spec §3).
// Statisch pad + `?id=`/`?tab=` (zelfde conventie als de bestaande
// admin-detailpagina's, bv. SalesSchooldetailView — nooit een dynamische
// [id]-routesegment, zie payload/components/AdminViewShell.tsx). `tab` kiest
// welke ÉÉN van de zeven lib/admin/trainers/trainerdetail.ts-functies wordt
// aangeroepen — bewust GEEN "geef alles in één keer terug"-modus: dat zou
// bij elke paginalading drie keer dezelfde Monday-boarddata ophalen (zie de
// toelichting bovenaan trainerdetail.ts) en een overbodig grote payload naar
// de client sturen (spec §13/§16).
const TABS = ["basis", "overzicht", "scholen", "trainingen", "verslagen", "logboek", "telefonie", "bestanden"] as const;
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

  const idRaw = request.nextUrl.searchParams.get("id");
  const trainerId = Number(idRaw);
  if (!idRaw || !Number.isInteger(trainerId)) {
    return NextResponse.json({ error: "Ongeldig of ontbrekend trainer-ID." }, { status: 400 });
  }

  const tabRaw = request.nextUrl.searchParams.get("tab") ?? "basis";
  if (!isTab(tabRaw)) {
    return NextResponse.json({ error: "Ongeldig tabblad." }, { status: 400 });
  }

  const uitkomst = await (async () => {
    switch (tabRaw) {
      case "basis":
        return haalAdminTrainerBasis(payload, trainerId);
      case "overzicht":
        return haalAdminTrainerOverzichtTab(payload, trainerId);
      case "scholen":
        return haalAdminTrainerScholenTab(payload, trainerId);
      case "trainingen":
        return haalAdminTrainerTrainingenTab(payload, trainerId);
      case "verslagen":
        return haalAdminTrainerVerslagenTab(payload, trainerId);
      case "logboek":
        return haalAdminTrainerLogboekTab(payload, trainerId);
      case "telefonie":
        return haalAdminTrainerTelefonieTab(payload, trainerId);
      case "bestanden":
        return haalAdminTrainerBestandenTab(payload, trainerId);
    }
  })();

  if (uitkomst.soort === "niet_gevonden") {
    return NextResponse.json({ error: "Trainer niet gevonden." }, { status: 404 });
  }
  return NextResponse.json(uitkomst.data);
}
