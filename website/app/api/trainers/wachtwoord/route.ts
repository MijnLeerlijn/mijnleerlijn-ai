import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { wijzigEigenWachtwoord } from "@/lib/trainers/wachtwoord";
import { maakRateLimiter } from "@/lib/contact/validate";

// Correctieronde Admin Traineromgeving (2026-08-25) — trainer wijzigt eigen
// wachtwoord vanaf /profiel. Zelfde skelet als app/api/trainers/logboek/
// route.ts: dun, sessieverificatie + validatie/uitkomst-vertaling hier, alle
// eigenlijke logica (payload.login-verificatie/payload.update-opslag) in
// lib/trainers/wachtwoord.ts. trainer.id komt UITSLUITEND uit de geverifieerde
// sessie — er bestaat geen enkel request-veld waarmee een ander account
// gekozen zou kunnen worden. Zelfde ratelimietvenster/-grens als de
// logboekroute (misbruikbestendig tegen herhaald gokken van het huidige
// wachtwoord — payload.login() se eigen maxLoginAttempts/lockTime, zie
// TrainerAccounts.ts, geldt hier bovenop mee).
const beperkAanvragen = maakRateLimiter(60_000, 10);

interface RequestBody {
  huidigWachtwoord?: string;
  nieuwWachtwoord?: string;
  nieuwWachtwoordBevestiging?: string;
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyTrainerSessionCookie(payload, request.cookies.get(TRAINER_SESSION_COOKIE_NAME)?.value);
  if (!sessieControle.trainer) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  const trainer = sessieControle.trainer;

  if (!beperkAanvragen.magVerder(String(trainer.id))) {
    return NextResponse.json({ error: "Te veel pogingen — probeer het over een minuut opnieuw." }, { status: 429 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (typeof body.huidigWachtwoord !== "string" || typeof body.nieuwWachtwoord !== "string" || typeof body.nieuwWachtwoordBevestiging !== "string") {
    return NextResponse.json({ error: "Vul alle velden in." }, { status: 400 });
  }

  try {
    const uitkomst = await wijzigEigenWachtwoord(payload, trainer, body.huidigWachtwoord, body.nieuwWachtwoord, body.nieuwWachtwoordBevestiging);

    switch (uitkomst.soort) {
      case "ok":
        return NextResponse.json({ ok: true });
      case "onjuist_huidig_wachtwoord":
        return NextResponse.json({ error: "Het huidige wachtwoord is onjuist." }, { status: 422 });
      case "ongeldige_invoer":
      case "nieuw_wachtwoord_geweigerd":
        return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
  } catch (error) {
    // Nooit de wachtwoorden zelf loggen — uitsluitend een generieke melding, zelfde principe als elders in lib/trainers/.
    console.error("[api/trainers/wachtwoord] wijzigen mislukt:", error instanceof Error ? error.message : "onbekende fout");
    return NextResponse.json({ error: "Wachtwoord wijzigen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
