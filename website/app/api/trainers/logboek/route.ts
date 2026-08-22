import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { maakLogboekItem, LOGBOEK_TYPES } from "@/lib/trainers/logboek";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V2, Fase 1 (2026-08-28) — handmatig logboekitem aanmaken
// (spec: "+ Logboekitem"-knop). Zelfde skelet als app/api/trainers/trainingen/
// [id]/verslag/concept/route.ts: dun, alle eigendomsherverificatie/
// opslaglogica zit in lib/trainers/logboek.ts. GEEN GET/PATCH/DELETE hier —
// de opdracht vraagt uitsluitend om aanmaken; lezen loopt via de server-side
// pagina's (/logboek, dashboard), nooit via een publieke REST-lees-API.
const beperkAanvragen = maakRateLimiter(60_000, 20);

interface RequestBody {
  mondaySchoolId?: string;
  type?: string;
  occurredAt?: string;
  tekst?: string;
  mondayTrainingId?: string;
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyTrainerSessionCookie(payload, request.cookies.get(TRAINER_SESSION_COOKIE_NAME)?.value);
  if (!sessieControle.trainer) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  const trainer = sessieControle.trainer;

  if (!beperkAanvragen.magVerder(String(trainer.id))) {
    return NextResponse.json({ error: "Te veel aanvragen — probeer het over een minuut opnieuw." }, { status: 429 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (typeof body.mondaySchoolId !== "string" || body.mondaySchoolId.length === 0) {
    return NextResponse.json({ error: "Kies een school." }, { status: 400 });
  }
  if (typeof body.type !== "string" || !(LOGBOEK_TYPES as readonly string[]).includes(body.type)) {
    return NextResponse.json({ error: "Kies een geldig type." }, { status: 400 });
  }
  if (typeof body.occurredAt !== "string" || body.occurredAt.length === 0) {
    return NextResponse.json({ error: "Kies een datum/tijd." }, { status: 400 });
  }
  if (typeof body.tekst !== "string" || body.tekst.trim().length === 0) {
    return NextResponse.json({ error: "Vul een notitie in." }, { status: 400 });
  }
  if (body.mondayTrainingId !== undefined && typeof body.mondayTrainingId !== "string") {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    const uitkomst = await maakLogboekItem(payload, trainer, {
      mondaySchoolId: body.mondaySchoolId,
      type: body.type as (typeof LOGBOEK_TYPES)[number],
      occurredAt: body.occurredAt,
      tekst: body.tekst,
      mondayTrainingId: body.mondayTrainingId || undefined,
    });

    if (uitkomst.soort === "niet_gevonden") {
      // 404, nooit 403 — zelfde anti-enumeratiepatroon als de bestaande verslag-/trainingen-routes.
      return NextResponse.json({ error: "School (of training) niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "ongeldige_invoer") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json({ item: uitkomst.item });
  } catch (error) {
    console.error("[api/trainers/logboek] mislukt:", error);
    return NextResponse.json({ error: "Logboekitem opslaan mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
