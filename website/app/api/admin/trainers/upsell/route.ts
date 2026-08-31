import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalRecenteVerslagActiviteitVoorAlleTrainers, haalAlleAanvullendeTrainingen } from "@/lib/admin/trainers/aggregatie";
import { haalTrainingenEnScholenVoorAlleTrainers } from "@/lib/trainers/monday-links";
import { bouwAdminTrainingenLijst, type AdminTrainingRegel } from "@/lib/admin/trainers/trainingen";

// Upsell-ronde (2026-09-02, spec §12) — "Trainingen & upsell": nieuw
// beheer-overzicht met trainer-multiselect/school/periode/type-filters. Zelfde
// architectuur als app/api/admin/trainers/trainingen/route.ts (spec §13: geen
// N+1 Monday-call, bestaande admin-aggregatie hergebruikt) — dit is bewust
// GEEN eigen datalaag: precies dezelfde drie admin-brede bronnen +
// bouwAdminTrainingenLijst, hier ONGEFILTERD teruggegeven. Filteren/optellen/
// groeperen (per trainer/school/maand, spec §12) gebeurt client-side in
// TrainersUpsellView.tsx — zelfde "één fetch, client-side afgeleid" opzet als
// TrainersTrainingenView.tsx, zodat elke filterwijziging instant is zonder
// nieuwe round-trip. `trainerOpties` wordt apart meegegeven (i.p.v. afgeleid
// uit de rijen zelf) zodat de multiselect ook trainers toont die toevallig
// nul trainingen van welke soort dan ook hebben.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.upsell")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  const [trainers, mondayOverzicht, verslagenActiviteit, aanvullendeTrainingen] = await Promise.all([
    haalAlleTrainerAccounts(payload),
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalRecenteVerslagActiviteitVoorAlleTrainers(payload),
    haalAlleAanvullendeTrainingen(payload),
  ]);

  const trainingen: AdminTrainingRegel[] = bouwAdminTrainingenLijst(mondayOverzicht, trainers, verslagenActiviteit, aanvullendeTrainingen);
  // Bewust ALLE trainers (ook inactieve) — zelfde reden als TrainersOverzichtView.tsx
  // se trainerlijst: een gedeactiveerde trainer kan nog altijd historische
  // upsell-data hebben die de moeite waard is om apart te bekijken.
  const trainerOpties = trainers.map((t) => ({ id: t.id, naam: t.naam, actief: t.actief }));

  return NextResponse.json({ trainingen, trainerOpties });
}
