import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalRecenteVerslagActiviteitVoorAlleTrainers, haalLogboekitemsVoorAlleTrainers, haalMislukteTelefonieOproepenVoorAlleTrainers } from "@/lib/admin/trainers/aggregatie";
import { bouwAdminActiviteitFeed, type AdminActiviteitItem } from "@/lib/admin/trainers/activiteit";

const STANDAARD_LIMIET = 100;
const MAX_LIMIET = 300;

// Traineromgeving V2, Fase 4 (2026-08-24) — admin-brede Activiteit (spec
// §6). `limiet` is client-instelbaar (bv. "toon meer") maar begrensd (spec
// §13) — nooit hoger dan MAX_LIMIET, ongeacht wat de client opgeeft.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.activiteit")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const limietParam = Number(params.get("limiet"));
  const limiet = Number.isInteger(limietParam) && limietParam > 0 ? Math.min(limietParam, MAX_LIMIET) : STANDAARD_LIMIET;

  const [trainers, verslagen, logboekitems, misluktOproepen] = await Promise.all([
    haalAlleTrainerAccounts(payload),
    haalRecenteVerslagActiviteitVoorAlleTrainers(payload),
    haalLogboekitemsVoorAlleTrainers(payload),
    haalMislukteTelefonieOproepenVoorAlleTrainers(payload),
  ]);

  // Bewust MAX_LIMIET (nooit het kleinere, client-gevraagde `limiet`) aan de
  // builder meegeven: filteren moet op de volledige, nog-ongefilterde feed
  // gebeuren. Zou hier al met `limiet` worden afgekapt, dan kan een
  // trainer-/schoolfilter een kunstmatig schraal resultaat tonen — de
  // gefilterde trainer kan best veel activiteit hebben die toevallig niet in
  // de top-N over ALLE trainers viel. De uiteindelijke `limiet` wordt pas ná
  // filteren toegepast, zie de slice hieronder.
  let activiteit: AdminActiviteitItem[] = bouwAdminActiviteitFeed(verslagen, logboekitems, misluktOproepen, trainers, MAX_LIMIET);

  const trainerIdParam = params.get("trainerId");
  if (trainerIdParam) {
    const trainerId = Number(trainerIdParam);
    activiteit = activiteit.filter((a) => a.trainerId === trainerId);
  }

  const schoolId = params.get("schoolId");
  if (schoolId) activiteit = activiteit.filter((a) => a.schoolId === schoolId);

  const soort = params.get("soort");
  if (soort) activiteit = activiteit.filter((a) => a.soort === soort);

  const vanaf = params.get("vanaf");
  if (vanaf) activiteit = activiteit.filter((a) => a.wanneer >= vanaf);

  const tot = params.get("tot");
  if (tot) activiteit = activiteit.filter((a) => a.wanneer <= tot);

  return NextResponse.json({ activiteit: activiteit.slice(0, limiet) });
}
