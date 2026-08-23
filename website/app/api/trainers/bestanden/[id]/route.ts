import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { verwijderTrainerBestand } from "@/lib/trainers/bestanden";

// Traineromgeving V2, Fase 3 (2026-08-23) — eigen bestand verwijderen (spec
// §7: eigen algemene bestanden altijd, eigen schoolbestanden alleen zolang
// nog gekoppeld aan die school; nooit andermans bestand, nooit alleen omdat
// het via een groep zichtbaar is). Alle eigendomscontrole zit in
// lib/trainers/bestanden.ts se verwijderTrainerBestand — deze route is dun.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bestandId = Number(id);
  if (!Number.isInteger(bestandId)) {
    return NextResponse.json({ error: "Ongeldig bestand-ID." }, { status: 400 });
  }

  const payload = await getPayload({ config });

  const sessieControle = await verifyTrainerSessionCookie(payload, request.cookies.get(TRAINER_SESSION_COOKIE_NAME)?.value);
  if (!sessieControle.trainer) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  try {
    const uitkomst = await verwijderTrainerBestand(payload, sessieControle.trainer, bestandId);
    if (uitkomst === "niet_gevonden") {
      return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
    }
    if (uitkomst === "geen_toegang") {
      // 404, nooit 403 — zelfde anti-enumeratiepatroon als de downloadroute.
      return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/trainers/bestanden/[id]] verwijderen mislukt:", error);
    return NextResponse.json({ error: "Verwijderen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
