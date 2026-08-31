import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { maakAanvullendeTraining } from "@/lib/trainers/aanvullende-trainingen";
import { maakRateLimiter } from "@/lib/contact/validate";

// Upsell-ronde (2026-09-02, spec §A2/§J) — "+ Aanvullende training"
// aanmaken. Harde productseis: binnen ongeveer 10 seconden — dus hier
// UITSLUITEND naam + datum in de request-body, niets anders. `school` komt
// uit het pad (net als de bestanden-route hierboven), nooit uit de
// request-body: een trainer kan hier dus geen ander school-ID forceren dan
// waar hij al op de schooldetailpagina voor staat. De trainer die de
// aanroep doet wordt in maakAanvullendeTraining() zelf altijd de gekoppelde
// trainer (spec §A2: "wordt automatisch als trainer gekoppeld") — dat veld
// komt dus ook nooit uit de request-body.
const beperkAanvragen = maakRateLimiter(60_000, 20);

interface RequestBody {
  naam?: string;
  datum?: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ school: string }> }) {
  const { school: mondaySchoolId } = await params;
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

  if (typeof body.naam !== "string" || typeof body.datum !== "string") {
    return NextResponse.json({ error: "Geef een trainingnaam en datum op." }, { status: 400 });
  }

  try {
    const uitkomst = await maakAanvullendeTraining(payload, trainer, { mondaySchoolId, naam: body.naam, datum: body.datum });

    if (uitkomst.soort === "niet_gevonden") {
      // 404, nooit 403 — zelfde anti-enumeratiepatroon als de bestaande verslag-/logboek-/bestanden-routes.
      return NextResponse.json({ error: "School niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "ongeldige_invoer") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json({ training: uitkomst.training });
  } catch (error) {
    console.error("[api/trainers/scholen/[school]/aanvullende-trainingen] mislukt:", error);
    return NextResponse.json({ error: "Aanmaken mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
