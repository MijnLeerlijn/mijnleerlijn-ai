import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalRecenteVerslagActiviteitVoorAlleTrainers } from "@/lib/admin/trainers/aggregatie";
import { haalTrainingenEnScholenVoorAlleTrainers } from "@/lib/trainers/monday-links";
import { bouwAdminTrainingenLijst, type AdminTrainingRegel } from "@/lib/admin/trainers/trainingen";

// Traineromgeving V2, Fase 4 (2026-08-24) — "Alle trainingen" adminbreed
// (spec §4): filters trainer/school/status/datum-periode/verslagstatus.
// Live Monday-data zoals de portal (haalTrainingenEnScholenVoorAlleTrainers —
// 2 Monday-aanroepen totaal, spec §13), geen lokale trainingscache. Filters
// worden hier, ná het samenstellen van de volledige (maar wél al
// admin-breed-in-één-keer-opgehaalde) lijst, toegepast — geen extra
// databronaanroep per filtercombinatie.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  const [trainers, mondayOverzicht, verslagenActiviteit] = await Promise.all([
    haalAlleTrainerAccounts(payload),
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalRecenteVerslagActiviteitVoorAlleTrainers(payload),
  ]);

  let trainingen: AdminTrainingRegel[] = bouwAdminTrainingenLijst(mondayOverzicht, trainers, verslagenActiviteit);

  const params = request.nextUrl.searchParams;

  const trainerIdParam = params.get("trainerId");
  if (trainerIdParam) {
    const trainerId = Number(trainerIdParam);
    trainingen = trainingen.filter((t) => t.trainerId === trainerId);
  }

  const schoolId = params.get("schoolId");
  if (schoolId) trainingen = trainingen.filter((t) => t.schoolId === schoolId);

  const status = params.get("status");
  if (status) trainingen = trainingen.filter((t) => t.weergaveStatus === status);

  // "geen" = expliciet filteren op trainingen ZONDER verslagrij — literal
  // Payload-statuswaarden bevatten dit woord zelf nooit, dus geen conflict.
  const verslagStatus = params.get("verslagStatus");
  if (verslagStatus) trainingen = trainingen.filter((t) => (verslagStatus === "geen" ? t.verslagStatus === null : t.verslagStatus === verslagStatus));

  const vanaf = params.get("vanaf");
  if (vanaf) trainingen = trainingen.filter((t) => (t.datum ?? "") >= vanaf);

  const tot = params.get("tot");
  if (tot) trainingen = trainingen.filter((t) => (t.datum ?? "") <= tot);

  return NextResponse.json({ trainingen });
}
