import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { upsertConcept, verwijderConcept } from "@/lib/trainers/verslag";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V1, Ronde 3 (2026-08-24) — concept bewaren/autosave (spec
// §14). Zelfde skelet als app/api/trainers/trainingen/[id]/route.ts: dun,
// alle eigendomsherverificatie/opslaglogica zit in lib/trainers/verslag.ts.
// Bewust een RUIMERE rate limit dan de bestaande PATCH-route: dit endpoint
// is bedoeld voor herhaalde, gedebouncede autosaves terwijl de trainer typt,
// geen eenmalige actie.
const beperkAanvragen = maakRateLimiter(60_000, 60);

interface RequestBody {
  trainerInvoer?: string;
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

  if (body.trainerInvoer === undefined && body.definitieveTekst === undefined) {
    return NextResponse.json({ error: "Ongeldige aanvraag — geef trainerInvoer of definitieveTekst op." }, { status: 400 });
  }
  if (body.trainerInvoer !== undefined && typeof body.trainerInvoer !== "string") {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  if (body.definitieveTekst !== undefined && typeof body.definitieveTekst !== "string") {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    const uitkomst = await upsertConcept(payload, trainer, id, { trainerInvoer: body.trainerInvoer, definitieveTekst: body.definitieveTekst });

    if (uitkomst.soort === "niet_gevonden") {
      // 404, nooit 403 — zelfde privacy-patroon als de bestaande trainingen-route.
      return NextResponse.json({ error: "Training niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "niet_bewerkbaar") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json({ verslag: uitkomst.verslag });
  } catch (error) {
    console.error("[api/trainers/trainingen/[id]/verslag/concept] mislukt:", error);
    return NextResponse.json({ error: "Concept opslaan mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}

// Ronde 3.5 (2026-08-25) — spec §14: trainer moet een fout (telefonisch)
// concept kunnen verwijderen. Zelfde sessie-/eigendomscontrole als POST
// hierboven; de eigenlijke veiligheidsgrens (alleen status "concept") zit in
// verwijderConcept() zelf (lib/trainers/verslag.ts), niet hier.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  try {
    const uitkomst = await verwijderConcept(payload, trainer, id);
    if (uitkomst.soort === "niet_gevonden") {
      return NextResponse.json({ error: "Concept niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "niet_verwijderbaar") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/trainers/trainingen/[id]/verslag/concept] verwijderen mislukt:", error);
    return NextResponse.json({ error: "Concept verwijderen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
