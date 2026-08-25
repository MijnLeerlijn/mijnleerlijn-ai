import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { creatorChat, type CreatorChatBericht, type ContextItemRef } from "@/lib/creator/creator-chat";

// Creator V1 (2026-08-13) — backend voor het AI-schrijfgesprek
// (payload/components/CreatorView.tsx). Zelfde sessieverificatiepatroon als
// bv. app/api/verbetercentrum/stats/route.ts — payload.auth() rechtstreeks
// gebruiken faalt op een POST wanneer de Origin-header niet exact
// overeenkomt (zie lib/auth/verify-session.ts), verifyAdminSessionCookie()
// omzeilt dat zonder de beveiliging te verzwakken.
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
      documentTitel: string;
      documentTekst?: string;
      berichten: CreatorChatBericht[];
      knowledgeType: "product" | "pedagogisch";
      variantId?: string;
      gepindeKnowledgeSourceIds?: number[];
      uitgeslotenRefs?: ContextItemRef[];
    };

    if (!body.documentTitel || !Array.isArray(body.berichten) || body.berichten.length === 0) {
      return NextResponse.json({ error: "documentTitel en berichten zijn verplicht." }, { status: 400 });
    }

    const resultaat = await creatorChat(payload, {
      documentTitel: body.documentTitel,
      documentTekst: body.documentTekst ?? "",
      berichten: body.berichten,
      knowledgeType: body.knowledgeType,
      variantId: body.variantId || undefined,
      gepindeKnowledgeSourceIds: body.gepindeKnowledgeSourceIds,
      uitgeslotenRefs: body.uitgeslotenRefs,
    });
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/creator/chat] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
