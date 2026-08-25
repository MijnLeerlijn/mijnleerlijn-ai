import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

const GELDIGE_STATUSSEN = ["nieuw", "beoordeeld", "opgelost", "genegeerd"] as const;
type Status = (typeof GELDIGE_STATUSSEN)[number];

// AI Verbetercentrum: zet de beheerder-workflowstatus van een
// helpdeskgesprek direct — gebruikt door de "Markeer als opgelost"/"Negeer"-
// knoppen (en, generiek, elke andere statusovergang).
//
// Body: { conversationId: number; status: "nieuw" | "beoordeeld" | "opgelost" | "genegeerd" }.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "helpdesk-ai.verbetercentrum")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { conversationId, status } = (body ?? {}) as { conversationId?: unknown; status?: unknown };
  if (typeof conversationId !== "number") {
    return NextResponse.json({ error: "conversationId is verplicht." }, { status: 400 });
  }
  if (typeof status !== "string" || !GELDIGE_STATUSSEN.includes(status as Status)) {
    return NextResponse.json(
      { error: `status moet één van ${GELDIGE_STATUSSEN.join(", ")} zijn.` },
      { status: 400 }
    );
  }

  try {
    await payload.update({
      collection: "assistant-conversations",
      id: conversationId,
      overrideAccess: true,
      data: { verbeterStatus: status as Status },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/verbetercentrum/set-status] Status wijzigen mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
