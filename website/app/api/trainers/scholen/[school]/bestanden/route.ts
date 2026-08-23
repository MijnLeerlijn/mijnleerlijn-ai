import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { maakSchoolBestand, haalFileUitFormData, naarRuwOpTeSlaanBestand } from "@/lib/trainers/bestanden";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V2, Fase 3 (2026-08-23) — schoolbestand uploaden (spec §1/
// §9: "+ Bestand uploaden" op Scholen → [school] → Bestanden, school al
// ingevuld en niet wijzigbaar). Zelfde skelet als app/api/trainers/logboek/
// route.ts: dun, alle eigendomsherverificatie/opslaglogica zit in
// lib/trainers/bestanden.ts. `school` komt uit het pad (dus van de pagina),
// nooit uit de request-body — een trainer kan hier dus geen ander school-ID
// forceren dan waar hij al op de pagina voor staat, en maakSchoolBestand
// verifieert dat school-ID daarna zelf nogmaals live tegen Monday.
const beperkAanvragen = maakRateLimiter(60_000, 10);

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
  const mondayTrainingId = String(form.get("mondayTrainingId") ?? "").trim() || undefined;

  try {
    const uitkomst = await maakSchoolBestand(payload, trainer, {
      mondaySchoolId,
      titel,
      categorie,
      omschrijving,
      mondayTrainingId,
      bestand: await naarRuwOpTeSlaanBestand(bestand),
    });

    if (uitkomst.soort === "niet_gevonden") {
      // 404, nooit 403 — zelfde anti-enumeratiepatroon als de bestaande verslag-/logboek-routes.
      return NextResponse.json({ error: "School (of training) niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "ongeldige_invoer") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json({ bestand: uitkomst.bestand });
  } catch (error) {
    console.error("[api/trainers/scholen/[school]/bestanden] mislukt:", error);
    return NextResponse.json({ error: "Uploaden mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
