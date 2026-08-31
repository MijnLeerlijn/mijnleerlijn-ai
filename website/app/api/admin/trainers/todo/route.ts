import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalOpenVerslagenVoorAlleTrainers, haalAlleOpenStartActiesVoorAlleTrainers } from "@/lib/admin/trainers/aggregatie";
import { haalTrainingenEnScholenVoorAlleTrainers } from "@/lib/trainers/monday-links";
import { bouwAdminTodoLijst, type AdminTodoItem } from "@/lib/admin/trainers/todo";

// Traineromgeving V2, Fase 4 (2026-08-24) — adminbreed To do (spec §5):
// "hergebruik EXACT de bestaande to-do-logica" — bouwAdminTodoLijst spiegelt
// lib/trainers/dashboard.ts se haalDashboardV2Data 1-op-1 (zie dat bestand se
// doc-comment); deze route levert uitsluitend de ingrediënten aan en filtert
// het resultaat, definieert zelf geen enkele nieuwe to-do-regel.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.todo")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  const [trainers, mondayOverzicht, openVerslagen, openStartActies] = await Promise.all([
    haalAlleTrainerAccounts(payload),
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalOpenVerslagenVoorAlleTrainers(payload),
    haalAlleOpenStartActiesVoorAlleTrainers(payload),
  ]);

  let todo: AdminTodoItem[] = bouwAdminTodoLijst(mondayOverzicht, openVerslagen, trainers, openStartActies);

  const params = request.nextUrl.searchParams;

  const trainerIdParam = params.get("trainerId");
  if (trainerIdParam) {
    const trainerId = Number(trainerIdParam);
    todo = todo.filter((t) => t.trainerId === trainerId);
  }

  const soort = params.get("soort");
  if (soort) todo = todo.filter((t) => t.soort === soort);

  const schoolId = params.get("schoolId");
  if (schoolId) todo = todo.filter((t) => t.schoolId === schoolId);

  // "ouderdom" — minimaal aantal dagen sinds `wanneer` (spec §5-filter
  // "ouderdom"). Items zonder betrouwbare wanneer-waarde (leeg — kan bij
  // telefonisch_concept zonder gekoppelde ontvangenOp) worden bij dit filter
  // uitgesloten in plaats van geraden.
  const minimaalDagenOud = params.get("minimaalDagenOud");
  if (minimaalDagenOud) {
    const drempel = Number(minimaalDagenOud);
    const nu = Date.now();
    todo = todo.filter((t) => {
      if (!t.wanneer) return false;
      const dagenOud = (nu - new Date(t.wanneer).getTime()) / (24 * 60 * 60 * 1000);
      return dagenOud >= drempel;
    });
  }

  return NextResponse.json({ todo });
}
