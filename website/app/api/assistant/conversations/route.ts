import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

const LIMIET = 50;

// Lijst van de eigen eerdere gesprekken, voor de zijbalk op /assistant.
// Eigen GET-route i.p.v. Payload's ingebouwde REST-API (/api/assistant-
// conversations) — zelfde reden als de andere eigen routes: lib/auth/
// verify-session.ts omzeilt de Origin-afhankelijke cookie-gate die
// payload.auth() (waar Payload's REST-API intern op leunt) heeft, en dat
// wilden we hier niet aan het toeval overlaten voor een client-side fetch.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json(
      { error: "Alleen ingelogde gebruikers mogen gesprekken bekijken." },
      { status: 403 }
    );
  }

  const resultaat = await payload.find({
    collection: "assistant-conversations",
    where: { user: { equals: sessieControle.user!.id } },
    sort: "-createdAt",
    limit: LIMIET,
    overrideAccess: true,
    depth: 0,
    select: { question: true, hasAnswer: true, confidence: true, createdAt: true },
  });

  return NextResponse.json({
    conversations: resultaat.docs.map((doc) => ({
      id: doc.id,
      question: doc.question,
      hasAnswer: doc.hasAnswer,
      confidence: doc.confidence,
      createdAt: doc.createdAt,
    })),
  });
}
