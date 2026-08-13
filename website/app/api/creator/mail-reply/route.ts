import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { schrijfMailAntwoord } from "@/lib/creator/mail-reply";

// Creator V1 (2026-08-13) — "Mail schrijven"-route (2C). Roept alleen de
// AI-conceptgeneratie aan; CreatorView.tsx slaat het resultaat zelf op in
// het mail-drafts-record via Payload's eigen REST-API.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { ontvangenTekst?: string; instructie: string; templateTekst?: string; variantId?: string };
    if (!body.instructie || !body.instructie.trim()) {
      return NextResponse.json({ error: "instructie is verplicht — vertel wat de mail moet zeggen." }, { status: 400 });
    }

    const resultaat = await schrijfMailAntwoord(payload, {
      ontvangenTekst: body.ontvangenTekst || undefined,
      instructie: body.instructie,
      templateTekst: body.templateTekst || undefined,
      variantId: body.variantId || undefined,
    });
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/creator/mail-reply] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
