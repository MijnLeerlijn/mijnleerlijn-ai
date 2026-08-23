import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { beantwoordTrainerKennisVraag } from "@/lib/trainers/kennis";
import { maakRateLimiter } from "@/lib/contact/validate";

// Vervolgronde (2026-08-22) — losstaande route/retrievalflow voor de
// trainer-Kennis-Q&A (opdrachtseis: "niet samenvoegen" met het bestaande
// /api/trainers/vraag, dat over eigen scholen/planning gaat). Zelfde skelet
// als die route (sessieverificatie/rate limiting/generieke foutmeldingen),
// maar importeert bewust NIETS uit lib/trainers/trainer-chat.ts/
// ai-context.ts/monday-links.ts — uitsluitend lib/trainers/kennis.ts, dat op
// zijn beurt uitsluitend gepubliceerde trainer-kennisversies raakt.
const MAX_VRAAG_LENGTE = 500;

// Zelfde orde van grootte als /api/trainers/vraag.
const beperkAanvragen = maakRateLimiter(10 * 60 * 1000, 20);

interface RequestBody {
  vraag?: string;
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

  try {
    const uitkomst = await beantwoordTrainerKennisVraag(payload, trainer.id, vraag);

    if (uitkomst.type === "failed") {
      // Generiek naar de client — nooit foutmelding/raw AI-providerfouten
      // lekken (zelfde opdrachtseis als /api/trainers/vraag). Details
      // uitsluitend server-side.
      console.error("[api/trainers/kennis/vraag] mislukt:", uitkomst.foutmelding);
      return NextResponse.json({ error: "Vraag stellen mislukt. Probeer het opnieuw." }, { status: 500 });
    }

    return NextResponse.json({
      antwoord: uitkomst.answer,
      bronnen: uitkomst.bronnen.map((b) => ({ id: b.id, titel: b.titel })),
    });
  } catch (error) {
    console.error("[api/trainers/kennis/vraag] mislukt:", error);
    return NextResponse.json({ error: "Vraag stellen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
