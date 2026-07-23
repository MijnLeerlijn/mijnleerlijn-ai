import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { processQuestion } from "@/lib/assistant/process-question";

const MAX_VRAAG_LENGTE = 1000;

// Stelt een vraag aan de AI-assistent — zie lib/assistant/process-question.ts
// voor de volledige RAG-pijplijn (embedding → semantische zoekopdracht →
// context → antwoord → loggen). Alleen ingelogde gebruikers (beheerder of
// redacteur — zie de opdracht "Alleen ingelogde gebruikers"; er bestaat in
// dit project geen apart publiek gebruikersaccount, zie het commentaar
// bovenin app/(frontend)/assistant/page.tsx voor de volledige afweging).
// Zelfde sessieverificatie als de andere eigen POST-routes
// (lib/auth/verify-session.ts, geen payload.auth() — zie de uitleg daar).
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json(
      { error: "Alleen ingelogde gebruikers mogen de assistent gebruiken." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { question } = (body ?? {}) as { question?: unknown };

  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "question is verplicht." }, { status: 400 });
  }
  if (question.length > MAX_VRAAG_LENGTE) {
    return NextResponse.json(
      { error: `Vraag is te lang (max ${MAX_VRAAG_LENGTE} tekens).` },
      { status: 400 }
    );
  }

  try {
    const resultaat = await processQuestion(payload, {
      question: question.trim(),
      userId: sessieControle.user!.id,
    });

    if (resultaat.type === "failed") {
      payload.logger.error(`[api/assistant/ask] mislukt: ${resultaat.foutmelding}`);
      return NextResponse.json(
        { error: "De assistent kon geen antwoord genereren. Probeer het opnieuw." },
        { status: 502 }
      );
    }

    // Nooit de vraag/antwoordtekst loggen — alleen aantallen/technische
    // context, zie docs/SECURITY-AND-PRIVACY.md.
    payload.logger.info(
      `[api/assistant/ask] type=${resultaat.type} bronnen=${resultaat.sources.length} confidence=${resultaat.confidence}`
    );

    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/assistant/ask] Onverwachte fout:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
