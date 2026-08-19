import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { stelTrainerVraag } from "@/lib/trainers/trainer-chat";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V1, Ronde 2 afronding — Trainer-AI (2026-08-19) — enige,
// gedeelde trainer-facing AI-route (opdrachtseis "Maak een trainer-
// specifieke AI-route", enkelvoud): zowel het dashboard-Vraag-blok
// ("Alle scholen"/een gekozen eigen school) als het schooldetail-Vraag-blok
// ("Vraag over deze school") sturen hier hun POST naartoe — het verschil zit
// uitsluitend in schoolId (null = "Alle scholen"). Zelfde skelet als
// app/api/trainers/trainingen/[id]/route.ts (sessieverificatie via
// request.cookies.get(...), rate limiting, generieke foutmeldingen,
// object-level autorisatie/404 in de lib-laag) — dun, geen eigen logica hier
// buiten parsen/valideren/statusvertaling.
const MAX_VRAAG_LENGTE = 500;

// Zelfde orde van grootte als app/api/werk/chat/route.ts (20 per 10
// minuten): ingelogd, bedoeld voor herhaald gebruik in een lopend gesprek,
// geen eenmalige AI-actie.
const beperkAanvragen = maakRateLimiter(10 * 60 * 1000, 20);

interface RequestBody {
  vraag?: string;
  schoolId?: string | null;
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyTrainerSessionCookie(payload, request.cookies.get(TRAINER_SESSION_COOKIE_NAME)?.value);
  if (!sessieControle.trainer) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  const trainer = sessieControle.trainer;

  if (!beperkAanvragen.magVerder(String(trainer.id))) {
    return NextResponse.json({ error: "Te veel vragen achter elkaar. Probeer het over een paar minuten opnieuw." }, { status: 429 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const vraag = body.vraag?.trim();
  if (!vraag || vraag.length > MAX_VRAAG_LENGTE) {
    return NextResponse.json({ error: "Ongeldige vraag." }, { status: 400 });
  }

  // schoolId komt uitsluitend uit een expliciete UI-keuze (dropdown/vaste
  // schooldetailcontext) — hier alleen vormvalidatie; de daadwerkelijke
  // ownership-herverificatie (hoort dit school-ID bij déze trainer?) gebeurt
  // hierna in lib/trainers/trainer-chat.ts -> lib/trainers/ai-context.ts ->
  // haalSchoolDetail(), nooit hier en nooit op basis van client-invoer alleen.
  if (body.schoolId !== undefined && body.schoolId !== null && typeof body.schoolId !== "string") {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const schoolId = body.schoolId ?? null;

  try {
    const uitkomst = await stelTrainerVraag(payload, trainer, vraag, schoolId);

    if (uitkomst.soort === "school_niet_gevonden") {
      // 404, nooit 403 — zelfde privacy-patroon als haalSchoolDetail/de
      // bestaande trainingen-route: een trainer mag nooit kunnen afleiden of
      // een school-ID van een andere trainer bestaat.
      return NextResponse.json({ error: "School niet gevonden." }, { status: 404 });
    }

    return NextResponse.json({ antwoord: uitkomst.antwoord, context: uitkomst.context });
  } catch (error) {
    // Generiek naar de client — nooit error.message/raw AI-providerfouten
    // lekken (opdrachtseis). Details uitsluitend server-side.
    console.error("[api/trainers/vraag] mislukt:", error);
    return NextResponse.json({ error: "Vraag stellen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
