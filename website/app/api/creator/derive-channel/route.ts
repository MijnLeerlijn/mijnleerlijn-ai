import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { deriveerContent, type AfgeleideKanaal } from "@/lib/creator/derive-channel";

// Creator V1 (2026-08-13) — "Maak hiervan → Nieuwsbrief/LinkedIn/Partnertekst".
// Roept alleen de AI-generatie aan; CreatorView.tsx slaat het resultaat zelf
// op als derived-content-record via Payload's eigen REST-API.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  // Admin gebruikersbeheer (2026-08-25) — permissiecheck naast de bestaande rolcheck.
  if (!heeftAdminPermissie(sessieControle.user, "creator.creator")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      bronTitel: string;
      bronTekst: string;
      channel: AfgeleideKanaal;
      audience?: "nieuwe_scholen" | "bestaande_scholen" | "overig";
      goal?: string;
      extraKennis?: { titel: string; tekst: string }[];
    };

    if (!body.bronTitel || !body.bronTekst || !body.channel) {
      return NextResponse.json({ error: "bronTitel, bronTekst en channel zijn verplicht." }, { status: 400 });
    }

    const resultaat = await deriveerContent(body);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/creator/derive-channel] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
