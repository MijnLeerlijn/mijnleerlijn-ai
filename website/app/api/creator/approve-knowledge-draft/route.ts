import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { keurMailKennisstukGoed } from "@/lib/creator/approve-mail-knowledge";

// Creator V1 (2026-08-13) — "Goedkeuren en opslaan" bij Mail schrijven →
// kennisstuk. KnowledgeDrafts.access.create is bewust `() => false` (zie
// dat bestand): aanmaken mag uitsluitend server-side met overrideAccess,
// nooit rechtstreeks via de publieke REST-API — deze route is dus de enige
// juiste plek voor deze schrijfactie, net als lib/support/analyze.ts voor de
// support-thread-route. isAdmin (niet isEditor, anders dan de overige
// creator-routes): KnowledgeDrafts is in z'n geheel admin-only (nog
// herleidbare brontekst tot beoordeling) en MailDrafts.linkedKnowledgeDraft
// is zelf ook al adminFieldOnly — beide bevestigen dezelfde grens.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen een kennisstuk goedkeuren." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      mailDraftId: number;
      title: string;
      question: string;
      shortAnswer: string;
      fullAnswer: string;
      customerSpecificInformationFound: boolean;
      customerSpecificInformationExplanation?: string;
    };
    if (!body.mailDraftId || !body.title || !body.question || !body.shortAnswer || !body.fullAnswer) {
      return NextResponse.json({ error: "mailDraftId, title, question, shortAnswer en fullAnswer zijn verplicht." }, { status: 400 });
    }

    const resultaat = await keurMailKennisstukGoed(payload, body);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/creator/approve-knowledge-draft] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
