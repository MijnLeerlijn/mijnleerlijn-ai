import { NextResponse, type NextRequest } from "next/server";
import { createAnswerFeedback } from "@/services/payload";
import { maakRateLimiter } from "@/lib/contact/validate";

// Ja/Nee-feedback onder een AI-antwoord (components/molecules/
// FeedbackControl.tsx) — zie docs/AI-KNOWLEDGE-STRATEGY.md §Kwaliteitsbewaking.
// Zelfde reden als app/api/contact/route.ts om via een eigen route te lopen:
// de AnswerFeedback-collection houdt `create` dicht voor de publieke API.

const MAX_TEKST_LENGTE = 2000;

// Ruimer venster dan het contactformulier — een bezoeker kan legitiem
// meerdere antwoorden na elkaar beoordelen, dit is puur misbruikbescherming.
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
    return NextResponse.json({ error: "Ongeldige inzending." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ongeldige inzending." }, { status: 400 });
  }

  const { vraag, antwoordTekst, bronArtikelSlugs, rating, pageUrl } = body as Record<string, unknown>;

  if (typeof vraag !== "string" || !vraag.trim() || vraag.length > MAX_TEKST_LENGTE) {
    return NextResponse.json({ error: "Ongeldige of ontbrekende vraag." }, { status: 400 });
  }
  if (typeof antwoordTekst !== "string" || !antwoordTekst.trim() || antwoordTekst.length > MAX_TEKST_LENGTE) {
    return NextResponse.json({ error: "Ongeldig of ontbrekend antwoord." }, { status: 400 });
  }
  if (rating !== "nuttig" && rating !== "niet_nuttig") {
    return NextResponse.json({ error: "Ongeldige beoordeling." }, { status: 400 });
  }
  const slugs = Array.isArray(bronArtikelSlugs) ? bronArtikelSlugs.filter((s) => typeof s === "string") : [];

  try {
    const variantSlug = request.headers.get("x-variant-slug") ?? undefined;
    const { id } = await createAnswerFeedback({
      vraag: vraag.trim(),
      antwoordTekst: antwoordTekst.trim(),
      bronArtikelSlugs: slugs,
      variantSlug,
      rating,
      pageUrl: typeof pageUrl === "string" ? pageUrl : undefined,
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[api/feedback] Opslaan van feedback mislukt:", error);
    return NextResponse.json({ error: "Er ging iets mis. Probeer het later opnieuw." }, { status: 500 });
  }
}
