import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { structureerVerslag } from "@/lib/trainers/verslag";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V1, Ronde 3 (2026-08-24) — AI-structurering van het
// trainingsverslag (spec §3/§4/§5). Zelfde skelet als app/api/trainers/
// vraag/route.ts (de andere AI-aanroepende trainer-route): dun, generieke
// foutmelding naar de client — nooit uitkomst.boodschap bij een AI-mislukking
// doorgeven, want die bevat de RUWE providerfoutmelding
// (structureerVerslag se eigen "AI-structurering mislukt: ${error.message}").
// Zelfde rate-orde-van-grootte als /vraag (20 per 10 minuten) — ook hier een
// bewuste, herhaalbare AI-actie, geen eenmalige.
const beperkAanvragen = maakRateLimiter(10 * 60 * 1000, 20);

interface RequestBody {
  trainerInvoer?: string;
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
    return NextResponse.json({ error: "Te veel aanvragen achter elkaar. Probeer het over een paar minuten opnieuw." }, { status: 429 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const trainerInvoer = body.trainerInvoer;
  if (typeof trainerInvoer !== "string" || !trainerInvoer.trim()) {
    return NextResponse.json({ error: "Geef eerst je aantekeningen op." }, { status: 400 });
  }

  try {
    const uitkomst = await structureerVerslag(payload, trainer, id, trainerInvoer);

    if (uitkomst.soort === "niet_gevonden") {
      // 404, nooit 403 — zelfde privacy-patroon als de bestaande trainingen-route.
      return NextResponse.json({ error: "Training niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "niet_bewerkbaar") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    if (uitkomst.soort === "mislukt") {
      // Nooit uitkomst.boodschap doorgeven — bevat de ruwe AI-providerfout (opdrachtseis, zie /vraag).
      console.error("[api/trainers/trainingen/[id]/verslag/structureer] AI-structurering mislukt:", uitkomst.boodschap);
      return NextResponse.json({ error: "AI-structurering is nu niet gelukt. Je aantekeningen zijn wel bewaard — probeer het zo opnieuw." }, { status: 502 });
    }
    return NextResponse.json({ verslag: uitkomst.verslag });
  } catch (error) {
    console.error("[api/trainers/trainingen/[id]/verslag/structureer] mislukt:", error);
    return NextResponse.json({ error: "AI-structurering mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
