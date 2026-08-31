import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import {
  haalAlleTrainerAccounts,
  haalOpenVerslagenVoorAlleTrainers,
  haalMislukteTelefonieOproepenVoorAlleTrainers,
  haalAlleOpenStartActiesVoorAlleTrainers,
} from "@/lib/admin/trainers/aggregatie";
import { bouwAdminAandachtOverzicht } from "@/lib/admin/trainers/aandacht";
import { haalTrainingenEnScholenVoorAlleTrainers } from "@/lib/trainers/monday-links";

// Traineromgeving V2, Fase 4 (2026-08-24) — admin-brede "Aandacht"-sectie
// (spec §7). Geen filters gevraagd door de opdracht voor dit onderdeel —
// deze route levert dus de volledige, al intern gesorteerde
// (langst-lopend/meest-urgent eerst) lijst.
//
// Correctieronde Admin Traineromgeving, vervolg (2026-08-25) — deze route
// haalt nu ook de admin-brede Monday-aggregatie op (dezelfde ÉÉN aanroep die
// de todo-/overzicht-/schooldetail-routes al gebruiken, geen N+1) zodat
// bouwAdminAandachtOverzicht een oud verslag/concept van een inmiddels
// verwijderde/overgedragen training kan uitsluiten — zie aandacht.ts.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.dashboard")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  const [trainers, openVerslagen, misluktOproepen, mondayOverzicht, openStartActies] = await Promise.all([
    haalAlleTrainerAccounts(payload),
    haalOpenVerslagenVoorAlleTrainers(payload),
    haalMislukteTelefonieOproepenVoorAlleTrainers(payload),
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalAlleOpenStartActiesVoorAlleTrainers(payload),
  ]);

  const aandacht = bouwAdminAandachtOverzicht(openVerslagen, misluktOproepen, trainers, mondayOverzicht.trainingenPerTrainer, new Date(), openStartActies);
  return NextResponse.json(aandacht);
}
