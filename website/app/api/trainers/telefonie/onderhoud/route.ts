import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { optionalEnv } from "@/config/env";
import { telnyxProvider } from "@/lib/trainers/telefonie/telnyx-provider";
import { verwerkTelefonieOnderhoud } from "@/lib/trainers/telefonie/gesprek";

// Traineromgeving V1, Ronde 3.5 vervolg (2026-08-25) — production-
// readiness-gate 1: de cron-getriggerde onderhoudsronde voor
// transcriptieherstel + audiobewaartermijn (lib/trainers/telefonie/
// gesprek.ts se verwerkTelefonieOnderhoud). Zelfde CRON_SECRET-Bearer-
// authenticatiepatroon als het al-bestaande app/api/sales/sync/route.ts —
// GEEN nieuwe schedulermechaniek, hergebruikt Vercel Cron (zie vercel.json).
//
// Bewust GEEN admin-handmatige-trigger-variant (in tegenstelling tot
// sales/sync se POST-ingang) — dit is een pure achtergrondopruimtaak zonder
// interactieve UI-behoefte in deze ronde (gate 3: geen extra functionaliteit
// buiten de twee gevraagde gates).
export async function GET(request: NextRequest) {
  const secret = optionalEnv("CRON_SECRET");
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 403 });
  }

  const payload = await getPayload({ config });
  try {
    const resultaat = await verwerkTelefonieOnderhoud(payload, telnyxProvider());
    return NextResponse.json(resultaat);
  } catch (error) {
    // Spec §9: geen ruwe foutinhoud (kan in theorie provider-responstekst
    // bevatten) naar gewone logs — uitsluitend een generieke regel.
    console.error("[api/trainers/telefonie/onderhoud] onverwachte fout tijdens de onderhoudsronde.");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Onbekende fout." }, { status: 500 });
  }
}
