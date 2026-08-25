import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { runAssistantEvaluation } from "@/lib/assistant/evaluate";

const MAX_VRAAG_LENGTE = 1000;

// Draait één testvraag door de volledige RAG-pijplijn met uitgebreide
// diagnostiek (lib/assistant/evaluate.ts) en legt het resultaat vast in
// assistant-eval-runs — zie payload/globals/AssistantEval.ts (de enige
// aanroeper) en payload/collections/AssistantEvalRuns.ts. Admin-only (niet
// isEditor zoals de echte /api/assistant/ask): dit toont ruwe
// retrieval-diagnostiek (similarity-scores, volledige contexttekst) die
// niet voor elke ingelogde redacteur bedoeld is.
//
// Body: { questionId?: number, question?: string } — questionId verwijst
// naar een vraag uit de vaste vragenset (assistant-eval-questions), question
// is voor een losse, handmatig ingevoerde testvraag. Precies één van beide.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen de chatbot-evaluatie draaien." }, { status: 403 });
  }

  // Admin gebruikersbeheer (2026-08-25) — permissiecheck naast de bestaande rolcheck.
  if (!heeftAdminPermissie(sessieControle.user, "helpdesk-ai.evaluatie")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { questionId, question: losseVraag } = (body ?? {}) as { questionId?: unknown; question?: unknown };

  let evalQuestionId: number | null = null;
  let questionText: string;

  if (typeof questionId === "number") {
    const evalQuestion = await payload
      .findByID({ collection: "assistant-eval-questions", id: questionId, overrideAccess: true })
      .catch(() => null);
    if (!evalQuestion) {
      return NextResponse.json({ error: `Testvraag ${questionId} niet gevonden.` }, { status: 404 });
    }
    evalQuestionId = evalQuestion.id;
    questionText = evalQuestion.question;
  } else if (typeof losseVraag === "string" && losseVraag.trim()) {
    questionText = losseVraag.trim();
  } else {
    return NextResponse.json({ error: "questionId of question is verplicht." }, { status: 400 });
  }

  if (questionText.length > MAX_VRAAG_LENGTE) {
    return NextResponse.json(
      { error: `Vraag is te lang (max ${MAX_VRAAG_LENGTE} tekens).` },
      { status: 400 }
    );
  }

  try {
    const uitkomst = await runAssistantEvaluation(payload, questionText);

    if (uitkomst.type === "failed") {
      payload.logger.error(`[api/assistant/eval/run] mislukt: ${uitkomst.foutmelding}`);
      return NextResponse.json(
        { error: "De evaluatie kon geen resultaat genereren. Probeer het opnieuw." },
        { status: 502 }
      );
    }

    const record = await payload.create({
      collection: "assistant-eval-runs",
      overrideAccess: true,
      data: {
        evalQuestion: evalQuestionId,
        question: uitkomst.question,
        rewrittenQuery: uitkomst.rewrittenQuery,
        retrievalFase: uitkomst.retrievalFase,
        hits: uitkomst.hits,
        contextText: uitkomst.contextText,
        hasAnswer: uitkomst.hasAnswer,
        answer: uitkomst.answer,
        reasoning: uitkomst.reasoning,
        confidence: uitkomst.confidence,
        sources: uitkomst.sources,
        model: uitkomst.model,
        verdict: "nog_niet_beoordeeld",
      },
    });

    payload.logger.info(
      `[api/assistant/eval/run] runId=${record.id} type=${uitkomst.type} fase=${uitkomst.retrievalFase} confidence=${uitkomst.confidence}`
    );

    return NextResponse.json({ runId: record.id, ...uitkomst });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/assistant/eval/run] Onverwachte fout:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
