import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { bevestigVerslag } from "@/lib/trainers/verslag";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V1, Ronde 3 (2026-08-24) — definitieve bevestiging: de
// dubbele Monday-Update-write + afronding (spec §6/§7/§9/§10). Zelfde
// skelet als de andere trainer-routes: dun, alle orchestratie zit in
// lib/trainers/verslag.ts se bevestigVerslag(). Dit endpoint bedient zowel
// de allereerste bevestiging (definitieveTekst verplicht) als een latere
// "opnieuw proberen" (geen/genegeerde definitieveTekst — bevestigVerslag
// hergebruikt dan altijd de al-vastgelegde tekst, spec §21) — bewust GEEN
// los vierde endpoint voor retry: bevestigVerslag is door constructie al
// veilig herroepbaar.
const beperkAanvragen = maakRateLimiter(60_000, 20);

interface RequestBody {
  definitieveTekst?: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  if (body.definitieveTekst !== undefined && typeof body.definitieveTekst !== "string") {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    const uitkomst = await bevestigVerslag(payload, trainer, id, body.definitieveTekst);

    if (uitkomst.soort === "niet_gevonden") {
      // 404, nooit 403 — zelfde privacy-patroon als de bestaande trainingen-route.
      return NextResponse.json({ error: "Training niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "niet_bewerkbaar") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    if (uitkomst.soort === "geannuleerd") {
      // 409: de onderliggende training-status is inmiddels gewijzigd — een conflict met de huidige toestand, geen ongeldige aanvraagvorm.
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 409 });
    }
    return NextResponse.json({ verslag: uitkomst.verslag, boodschap: uitkomst.boodschap, afronding: uitkomst.afronding, weergaveTekst: uitkomst.weergaveTekst });
  } catch (error) {
    console.error("[api/trainers/trainingen/[id]/verslag/bevestig] mislukt:", error);
    return NextResponse.json({ error: "Bevestigen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
