import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { processPublicQuestion, type ConversatieTurn } from "@/lib/assistant/process-public-question";
import { maakRateLimiter } from "@/lib/contact/validate";
import { registreerGesteldeVraag } from "@/lib/helpdesk/registreer-gestelde-vraag";
import { getActiveVariant } from "@/lib/variant/get-active-variant";
import { MAX_BERICHTEN_PER_DEELLINK } from "@/lib/helpdesk/delen";

const MAX_VRAAG_LENGTE = 1000;
// Gesprek delen — vervolgen (2026-09-01): de client stuurt bij het verder
// praten onder een gedeeld gesprek (HelpdeskChat.tsx se initieleBerichten)
// de tot dan toe gevoerde vraag/antwoord-paren mee als context (zie
// process-public-question.ts). Zelfde bovengrens als een deel-link zelf
// (MAX_BERICHTEN_PER_DEELLINK) — een gesprek kan nooit langer zijn dan wat
// ooit gedeeld kon worden, en begrenst de promptgrootte.
function isGeldigeConversatieGeschiedenis(value: unknown): value is ConversatieTurn[] {
  if (!Array.isArray(value) || value.length > MAX_BERICHTEN_PER_DEELLINK) return false;
  return value.every(
    (turn) =>
      turn &&
      typeof turn === "object" &&
      typeof (turn as { question?: unknown }).question === "string" &&
      typeof (turn as { answer?: unknown }).answer === "string" &&
      (turn as { question: string }).question.length <= MAX_VRAAG_LENGTE &&
      (turn as { answer: string }).answer.length <= 8000
  );
}

// Publieke, NIET-ingelogde tegenhanger van app/api/assistant/ask/route.ts —
// Helpdesk MVP 1.0. Bewust GEEN sessiecontrole: een bezoeker die vanuit de
// MijnLeerlijn-software op "Helpdesk" klikt, heeft geen CMS-account en mag
// zonder extra inlogstap direct een vraag stellen. Ter compensatie: dezelfde
// in-memory rate limiter als het contactformulier (lib/contact/validate.ts)
// — zonder login is misbruik (en dus onnodige, echte OpenAI-kosten) een
// reëel risico dat de interne /assistant-route niet had.
const rateLimiter = maakRateLimiter(10 * 60 * 1000, 20);

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
    return NextResponse.json(
      { error: "Te veel vragen achter elkaar. Probeer het over een paar minuten opnieuw." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { question, previousQuestion, conversationHistory } = (body ?? {}) as {
    question?: unknown;
    previousQuestion?: unknown;
    conversationHistory?: unknown;
  };

  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "question is verplicht." }, { status: 400 });
  }
  if (question.length > MAX_VRAAG_LENGTE) {
    return NextResponse.json(
      { error: `Vraag is te lang (max ${MAX_VRAAG_LENGTE} tekens).` },
      { status: 400 }
    );
  }
  if (previousQuestion !== undefined && (typeof previousQuestion !== "string" || previousQuestion.length > MAX_VRAAG_LENGTE)) {
    return NextResponse.json({ error: "previousQuestion is ongeldig." }, { status: 400 });
  }
  if (conversationHistory !== undefined && !isGeldigeConversatieGeschiedenis(conversationHistory)) {
    return NextResponse.json({ error: "conversationHistory is ongeldig." }, { status: 400 });
  }

  try {
    const payload = await getPayload({ config });
    // Multi-brand variants (2026-07-30): dezelfde functie als layout.tsx —
    // bepaalt welke variant retrieval-scoping, terminologie/productnaam in
    // de systeeminstructie en de tellingen per variant gebruiken.
    const variant = await getActiveVariant();

    // Telt deze vraag mee voor "Meest gestelde vragen" op de homepage
    // (lib/helpdesk/top5-voorbeeldvragen.ts) — elke aanvraag hier is per
    // definitie een bevestigde "Verstuur"-actie (klikken op een
    // voorbeeldvraag vult alleen het invoerveld, zie HelpdeskChat.tsx).
    // Parallel, niet-blokkerend t.o.v. het genereren van het antwoord —
    // allSettled i.p.v. all: registreerGesteldeVraag heeft weliswaar al een
    // eigen try/catch (mag dus in de praktijk nooit rejecten), maar een
    // onverwachte fout hier mag hoe dan ook nooit het al-berekende antwoord
    // laten mislukken, ook niet als die eigen bescherming ooit zou falen.
    const [, procesUitslag] = await Promise.allSettled([
      registreerGesteldeVraag(payload, question.trim(), variant.id),
      // previousQuestion: alleen gezet als de bezoeker een verduidelijkingsvraag
      // (type "clarification") beantwoordt — zie bepaal-intentie.ts en
      // HelpdeskChat.tsx.
      processPublicQuestion(payload, {
        question: question.trim(),
        previousQuestion: previousQuestion ? previousQuestion.trim() : undefined,
        conversationHistory,
        variant,
      }),
    ]);

    if (procesUitslag.status === "rejected") {
      throw procesUitslag.reason;
    }
    const resultaat = procesUitslag.value;

    if (resultaat.type === "failed") {
      payload.logger.error(`[api/helpdesk/ask] mislukt: ${resultaat.foutmelding}`);
      return NextResponse.json(
        { error: "De assistent is nu niet bereikbaar. Probeer het later opnieuw." },
        { status: 502 }
      );
    }

    payload.logger.info(
      `[api/helpdesk/ask] conversationId=${resultaat.conversationId} type=${resultaat.type}`
    );

    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/helpdesk/ask] Onverwachte fout:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
