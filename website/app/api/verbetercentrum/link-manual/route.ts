import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

const TOEGESTANE_COLLECTIES = ["handleidingen", "knowledge-sources"] as const;
type ToegestaneCollectie = (typeof TOEGESTANE_COLLECTIES)[number];

interface GekoppeldeHandleiding {
  relationTo: ToegestaneCollectie;
  value: number;
}

function isGekoppeldeHandleiding(waarde: unknown): waarde is GekoppeldeHandleiding {
  if (!waarde || typeof waarde !== "object") return false;
  const { relationTo, value } = waarde as { relationTo?: unknown; value?: unknown };
  return (
    typeof relationTo === "string" &&
    TOEGESTANE_COLLECTIES.includes(relationTo as ToegestaneCollectie) &&
    (typeof value === "number" || (typeof value === "object" && value !== null && "id" in value))
  );
}

function naarId(value: number | { id: number }): number {
  return typeof value === "number" ? value : value.id;
}

// AI Verbetercentrum: koppelt een (andere/aanvullende) handleiding of
// legacy-PDF aan het kennisbasis-onderwerp dat bij dit gesprek hoort —
// alleen zinvol als er al een onderwerp gekoppeld is (zie
// link-onderwerp/create-onderwerp hiervoor). Dedupliceert op
// relationTo+id, breidt uit i.p.v. te vervangen.
//
// Body: { conversationId: number; onderwerpId: number; handleiding: { relationTo, value } }.
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
  const { conversationId, onderwerpId, handleiding } = (body ?? {}) as {
    conversationId?: unknown;
    onderwerpId?: unknown;
    handleiding?: unknown;
  };
  if (typeof conversationId !== "number" || typeof onderwerpId !== "number") {
    return NextResponse.json({ error: "conversationId en onderwerpId zijn verplicht." }, { status: 400 });
  }
  if (!isGekoppeldeHandleiding(handleiding)) {
    return NextResponse.json(
      { error: "handleiding moet { relationTo: 'handleidingen'|'knowledge-sources', value } zijn." },
      { status: 400 }
    );
  }
  const nieuw = { relationTo: handleiding.relationTo, value: naarId(handleiding.value) };

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

    const huidig = ((onderwerp.gekoppeldeHandleidingen ?? []) as unknown[])
      .filter(isGekoppeldeHandleiding)
      .map((h) => ({ relationTo: h.relationTo, value: naarId(h.value) }));
    const bestaatAl = huidig.some((h) => h.relationTo === nieuw.relationTo && h.value === nieuw.value);
    const bijgewerkt = bestaatAl ? huidig : [...huidig, nieuw];

    await payload.update({
      collection: "kennisbasis-onderwerpen",
      id: onderwerpId,
      overrideAccess: true,
      data: { gekoppeldeHandleidingen: bijgewerkt },
    });

    if (gesprek.verbeterStatus === "nieuw") {
      await payload.update({
        collection: "assistant-conversations",
        id: conversationId,
        overrideAccess: true,
        data: { verbeterStatus: "beoordeeld" },
      });
    }

    return NextResponse.json({ ok: true, toegevoegd: !bestaatAl });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/verbetercentrum/link-manual] Koppelen mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
