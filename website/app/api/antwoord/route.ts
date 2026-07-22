import { NextResponse, type NextRequest } from "next/server";
import { zoek } from "@/services/retrieval";
import { genereerAntwoord } from "@/services/ai";
import { getActiveVariant } from "@/lib/variant/get-active-variant";
import { maakRateLimiter } from "@/lib/contact/validate";

// Echte zoek-/antwoordroute — vervangt lib/search/simulate.ts (dummydata) voor
// de daadwerkelijke SearchPanel/ZoekenClient-flow. Roept uitsluitend
// services/retrieval.ts en services/ai.ts aan, nooit rechtstreeks Payload of
// een externe dienst vanuit deze route — zie docs/PLATFORM-FOUNDATION.md §9.

const MAX_VRAAG_LENGTE = 500;
const rateLimiter = maakRateLimiter(10 * 60 * 1000, 30);

function klantIp(request: NextRequest): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "onbekend"
  );
}

export async function POST(request: NextRequest) {
  const ip = klantIp(request);
  if (!rateLimiter.magVerder(ip)) {
    return NextResponse.json({ error: "Te veel pogingen. Probeer het later opnieuw." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const vraag =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>).vraag : undefined;
  if (typeof vraag !== "string" || !vraag.trim() || vraag.length > MAX_VRAAG_LENGTE) {
    return NextResponse.json({ error: "Ongeldige of ontbrekende vraag." }, { status: 400 });
  }

  try {
    const variant = await getActiveVariant();
    const gevonden = await zoek(vraag.trim(), variant);
    const resultaat = await genereerAntwoord(vraag.trim(), gevonden);

    if (!resultaat.betrouwbaar) {
      return NextResponse.json({ type: "geen-antwoord", vraag: vraag.trim(), gerelateerd: [] });
    }

    return NextResponse.json({
      type: "antwoord",
      vraag: vraag.trim(),
      antwoord: resultaat.tekst,
      bronnen: resultaat.bronnen.map((b) => ({
        titel: b.articleTitle,
        sectie: b.sectionTitle,
        datum: b.lastContentUpdate,
        artikelSlug: b.articleSlug,
      })),
    });
  } catch (error) {
    console.error("[api/antwoord] Zoeken/antwoorden mislukt:", error);
    return NextResponse.json({ type: "fout", vraag: vraag.trim() }, { status: 500 });
  }
}
