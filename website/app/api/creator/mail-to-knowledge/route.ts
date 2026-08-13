import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { maakKennisstukVanMail } from "@/lib/creator/mail-to-knowledge";

// Creator V1 (2026-08-13) — "Maak hier een kennisstuk van" (sectie 16).
// Roept alleen de AI-extractie + PII-scrub aan; CreatorView.tsx persisteert
// het resultaat pas als knowledge-drafts-record ná expliciete goedkeuring
// door de gebruiker (via Payload's eigen REST-API, met origin:
// "creator-mail" + sourceMailDraft) — dezelfde "mens keurt goed"-stap als de
// bestaande support-thread-analyse.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { ontvangenTekst: string; conceptAntwoord: string };
    if (!body.ontvangenTekst || !body.conceptAntwoord) {
      return NextResponse.json({ error: "ontvangenTekst en conceptAntwoord zijn verplicht." }, { status: 400 });
    }

    const resultaat = await maakKennisstukVanMail(body);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/creator/mail-to-knowledge] mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
