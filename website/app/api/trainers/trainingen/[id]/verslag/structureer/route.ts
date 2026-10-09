import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { structureerVerslag } from "@/lib/trainers/verslag";
import { getAiModelId } from "@/services/ai-client";
import { maakRateLimiter } from "@/lib/contact/validate";

// Houd providerfouten server-side. Log geen aantekeningen, prompts, response bodies,
// ruwe providerfoutmeldingen of stacktraces: die kunnen school- of persoonsgegevens bevatten.
const beperkAanvragen = maakRateLimiter(10 * 60 * 1000, 20);

interface RequestBody {
  trainerInvoer?: string;
}

/** Best-effort classificatie van de bestaande tekstuele servicefout.
 * De service geeft momenteel alleen een foutboodschap terug, niet het originele
 * Error-object. Daarom is dit diagnostiek, geen bewijs van de hoofdoorzaak.
 */
function classificeerAiFout(boodschap: string): { categorie: string; httpStatus: number | null } {
  const tekst = boodschap.toLowerCase();
  const statusMatch = tekst.match(/(?:status(?:code)?|http)\s*[:=]?\s*(400|401|403|404|408|409|422|429|500|502|503|504)\b/);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : null;
  if (tekst.includes("ontbrekende verplichte omgevingsvariabele") || tekst.includes("openai_api_key") && tekst.includes("ontbreekt")) {
    return { categorie: "api_key_ontbreekt", httpStatus };
  }
  if (httpStatus === 401 || httpStatus === 403 || tekst.includes("invalid api key") || tekst.includes("incorrect api key")) {
    return { categorie: "authenticatie", httpStatus };
  }
  if (httpStatus === 429 || tekst.includes("quota") || tekst.includes("rate limit")) {
    return { categorie: "limiet_of_quota", httpStatus };
  }
  if (tekst.includes("json") || tekst.includes("schema") || tekst.includes("validation") || tekst.includes("no object generated")) {
    return { categorie: "gestructureerde_output", httpStatus };
  }
  if (tekst.includes("timeout") || tekst.includes("timed out") || tekst.includes("abort")) {
    return { categorie: "timeout", httpStatus };
  }
  if (httpStatus != null && httpStatus >= 500) return { categorie: "provider_serverfout", httpStatus };
  if (httpStatus != null && httpStatus >= 400) return { categorie: "provider_verzoek_afgewezen", httpStatus };
  return { categorie: "onbekend", httpStatus };
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

  const diagnoseId = randomUUID();
  const begonnen = Date.now();
  try {
    const uitkomst = await structureerVerslag(payload, trainer, id, trainerInvoer);

    if (uitkomst.soort === "niet_gevonden") {
      return NextResponse.json({ error: "Training niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "niet_bewerkbaar") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    if (uitkomst.soort === "mislukt") {
      console.error("[trainer-verslag-ai]", {
        diagnoseId,
        fase: "gestructureerde_output",
        model: getAiModelId(),
        ...classificeerAiFout(uitkomst.boodschap),
        duurMs: Date.now() - begonnen,
        invoerLengte: trainerInvoer.length,
      });
      return NextResponse.json({
        error: "AI-structurering is nu niet gelukt. Je aantekeningen zijn wel bewaard — probeer het zo opnieuw.",
        diagnoseId,
      }, { status: 502 });
    }
    return NextResponse.json({ verslag: uitkomst.verslag });
  } catch (error) {
    // Ook een onverwachte fout mag geen ruwe exception/stack met PII loggen.
    console.error("[trainer-verslag-ai]", {
      diagnoseId,
      fase: "onverwachte_serverfout",
      model: getAiModelId(),
      foutType: error instanceof Error ? error.name : "non_error",
      duurMs: Date.now() - begonnen,
    });
    return NextResponse.json({ error: "AI-structurering mislukt. Probeer het opnieuw.", diagnoseId }, { status: 500 });
  }
}
