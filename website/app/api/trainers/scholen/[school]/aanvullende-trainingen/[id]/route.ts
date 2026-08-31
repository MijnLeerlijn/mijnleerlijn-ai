import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { wijzigAanvullendeTraining } from "@/lib/trainers/aanvullende-trainingen";
import { maakRateLimiter } from "@/lib/contact/validate";

// Productiecheck-bugfix (2026-08-31) — naam/datum van een aanvullende
// training achteraf wijzigen (bug 1 uit de liveproef). `[school]` in het pad
// is bewust NIET de autorisatiebron (zelfde principe als elders in
// lib/trainers/): wijzigAanvullendeTraining herverifieert eigendom/
// schooltoegang zelf, rechtstreeks tegen de rij. Rauw numeriek ID i.p.v. de
// "aanvullend:<id>"-vorm — dit endpoint bestaat uitsluitend voor aanvullende
// trainingen, dus geen encoded vorm nodig (en dus ook geen herhaling van het
// Next.js-routeringsprobleem met een letterlijke ":" in het pad, zie de
// doc-comment bij genormaliseerTrainingId in lib/trainers/verslag.ts).
const beperkAanvragen = maakRateLimiter(60_000, 20);

interface RequestBody {
  naam?: string;
  datum?: string;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainingId = Number(id);
  if (!Number.isInteger(trainingId)) {
    return NextResponse.json({ error: "Ongeldig training-ID." }, { status: 400 });
  }

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
    const uitkomst = await wijzigAanvullendeTraining(payload, trainer, trainingId, { naam: body.naam, datum: body.datum });

    if (uitkomst.soort === "niet_gevonden") {
      // 404, nooit 403 — zelfde anti-enumeratiepatroon als de rest van lib/trainers/.
      return NextResponse.json({ error: "Training niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "ongeldige_invoer") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json({ training: uitkomst.training });
  } catch (error) {
    console.error("[api/trainers/scholen/[school]/aanvullende-trainingen/[id]] wijzigen mislukt:", error);
    return NextResponse.json({ error: "Wijzigen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
