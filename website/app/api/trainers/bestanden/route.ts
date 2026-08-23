import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { maakAlgemeenBestand, haalFileUitFormData, naarRuwOpTeSlaanBestand } from "@/lib/trainers/bestanden";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V2, Fase 3 (2026-08-23) — algemeen trainerbestand uploaden
// (spec §2/§10: "+ Bestand uploaden" op /bestanden, met zichtbaarheid
// "Alleen voor mij"/"Delen met groep(en)"). Alleen POST — lezen (Mijn
// bestanden/Met mij gedeeld) loopt server-side via de paginacomponent zelf
// (app/(trainers)/trainers/(portal)/bestanden/page.tsx), zelfde patroon als
// /scholen//trainingen: geen aparte publieke lees-API nodig.
const beperkAanvragen = maakRateLimiter(60_000, 10);

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const bestand = haalFileUitFormData(form, "file");
  if (!bestand) {
    return NextResponse.json({ error: "Geen bestand meegestuurd." }, { status: 400 });
  }

  const titel = String(form.get("titel") ?? "").trim();
  const categorie = String(form.get("categorie") ?? "");
  const omschrijving = String(form.get("omschrijving") ?? "").trim() || undefined;
  const zichtbaarheid = String(form.get("zichtbaarheid") ?? "");
  const deelgroepIds = form
    .getAll("deelgroepen")
    .map((waarde) => Number(waarde))
    .filter((n) => Number.isInteger(n));

  try {
    const uitkomst = await maakAlgemeenBestand(payload, trainer, {
      titel,
      categorie,
      omschrijving,
      zichtbaarheid,
      deelgroepIds,
      bestand: await naarRuwOpTeSlaanBestand(bestand),
    });

    if (uitkomst.soort === "niet_gevonden") {
      return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "ongeldige_invoer") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json({ bestand: uitkomst.bestand });
  } catch (error) {
    console.error("[api/trainers/bestanden] mislukt:", error);
    return NextResponse.json({ error: "Uploaden mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
