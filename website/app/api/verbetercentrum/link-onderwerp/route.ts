import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// AI Verbetercentrum: koppelt een bestaand kennisbasis-onderwerp aan een
// helpdeskgesprek. assistant-conversations staat create/update dicht voor de
// normale API (zie AssistantConversations.ts) — dit is, zoals
// app/api/assistant/feedback/route.ts, de enige gecontroleerde route die dit
// veld mag wijzigen. Admin-only: dit scherm behandelt ook anonieme
// helpdeskgesprekken, die toch al alleen voor een beheerder leesbaar zijn.
//
// Body: { conversationId: number; onderwerpId: number }.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { conversationId, onderwerpId } = (body ?? {}) as { conversationId?: unknown; onderwerpId?: unknown };
  if (typeof conversationId !== "number" || typeof onderwerpId !== "number") {
    return NextResponse.json({ error: "conversationId en onderwerpId zijn verplicht." }, { status: 400 });
  }

  try {
    const [onderwerp, gesprek] = await Promise.all([
      payload.findByID({ collection: "kennisbasis-onderwerpen", id: onderwerpId, overrideAccess: true, depth: 0, disableErrors: true }),
      payload.findByID({ collection: "assistant-conversations", id: conversationId, overrideAccess: true, depth: 0, disableErrors: true }),
    ]);
    if (!onderwerp) {
      return NextResponse.json({ error: "Kennisbasis-onderwerp niet gevonden." }, { status: 404 });
    }
    if (!gesprek) {
      return NextResponse.json({ error: "Gesprek niet gevonden." }, { status: 404 });
    }

    await payload.update({
      collection: "assistant-conversations",
      id: conversationId,
      overrideAccess: true,
      data: {
        kennisbasisOnderwerp: onderwerpId,
        gebruikteOfficieleTerm: onderwerp.officieleTerm,
        verbeterStatus: gesprek.verbeterStatus === "nieuw" ? "beoordeeld" : gesprek.verbeterStatus,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/verbetercentrum/link-onderwerp] Koppelen mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
