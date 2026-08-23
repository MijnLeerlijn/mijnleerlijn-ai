import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { genereerTrainerBestandDownloadUrl } from "@/lib/trainers/bestanden";

// Traineromgeving V2, Fase 3 (2026-08-23) — geautoriseerde download (spec
// §13: "niet simpelweg een permanent publieke object-storage-URL tonen";
// "bij elke download opnieuw controleren"). Zelfde patroon als
// app/api/media/[id]/route.ts: de opgeslagen Blob-URL/-sleutel is nooit
// rechtstreeks bruikbaar, deze route is de enige plek die een kortlevende
// signed URL opvraagt (services/storage.ts se genereerDownloadUrl, 5 minuten
// geldig) en doorstuurt — nooit gecachet (elke keer een nieuwe, andere URL).
//
// Herautorisatie gebeurt VOLLEDIG in genereerTrainerBestandDownloadUrl
// (lib/trainers/bestanden.ts se magTrainerBestandZien): eigenaar, of
// gekoppeld aan de school (schoolbestand), of lid van een gedeelde groep
// (algemeen bestand) — live, geen gecachete/gekopieerde rechten. "Niet
// gevonden" en "geen toegang" geven BEIDE 404 (anti-enumeratie, zelfde
// patroon als elders in de trainerportal): een trainer kan zo nooit
// onderscheiden of een bestand-ID gewoon niet bestaat, of van iemand anders
// is.
//
// Productiecontrole (2026-08-23): een onverwachte fout in de storage-stap
// (Vercel Blob signed-URL genereren) gaf voorheen een kale, ongevangen 500 —
// nu een eigen "fout"-uitkomst (genereerTrainerBestandDownloadUrl logt zelf
// al veilig bestandId/stap/categorie, zie lib/trainers/bestanden.ts) met een
// duidelijke 502 i.p.v. een framework-crashpagina.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const uitkomst = await genereerTrainerBestandDownloadUrl(payload, sessieControle.trainer, bestandId);
  if (uitkomst.soort === "fout") {
    return NextResponse.json({ error: "Downloaden is nu niet mogelijk. Probeer het later opnieuw." }, { status: 502 });
  }
  if (uitkomst.soort !== "ok") {
    return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  }

  return NextResponse.redirect(uitkomst.url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
