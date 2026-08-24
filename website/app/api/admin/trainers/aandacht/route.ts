import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalOpenVerslagenVoorAlleTrainers, haalMislukteTelefonieOproepenVoorAlleTrainers } from "@/lib/admin/trainers/aggregatie";
import { bouwAdminAandachtOverzicht } from "@/lib/admin/trainers/aandacht";

// Traineromgeving V2, Fase 4 (2026-08-24) — admin-brede "Aandacht"-sectie
// (spec §7). Geen filters gevraagd door de opdracht voor dit onderdeel —
// deze route levert dus de volledige, al intern gesorteerde
// (langst-lopend/meest-urgent eerst) lijst.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  const [trainers, openVerslagen, misluktOproepen] = await Promise.all([
    haalAlleTrainerAccounts(payload),
    haalOpenVerslagenVoorAlleTrainers(payload),
    haalMislukteTelefonieOproepenVoorAlleTrainers(payload),
  ]);

  const aandacht = bouwAdminAandachtOverzicht(openVerslagen, misluktOproepen, trainers);
  return NextResponse.json(aandacht);
}
