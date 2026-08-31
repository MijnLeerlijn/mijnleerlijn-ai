import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { wijzigStartactieStatus } from "@/lib/trainers/startbegeleiding";

// Startbegeleiding-ronde (2026-09-02, spec §F) — "Afgerond"/"Vervallen"
// handmatig door beheer zetten, zelfde PATCH-op-[id]-conventie als
// app/api/admin/trainers/logboek/[id]/route.ts. Alleen deze twee waarden:
// "open" wordt nooit via deze route gezet (dat is de defaultValue bij
// aanmaken, geen bestaande actie gaat ooit terug naar "open" — spec noemt
// geen "heropenen"-flow).
interface PatchBody {
  status?: string;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const startactieId = Number(id);
  if (!Number.isInteger(startactieId)) {
    return NextResponse.json({ error: "Ongeldig actie-ID." }, { status: 400 });
  }

  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.startbegeleiding")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (body.status !== "afgerond" && body.status !== "vervallen") {
    return NextResponse.json({ error: "Ongeldige status." }, { status: 400 });
  }

  try {
    const uitkomst = await wijzigStartactieStatus(payload, startactieId, body.status);
    if (uitkomst === "niet_gevonden") {
      return NextResponse.json({ error: "Actie niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/admin/trainers/startbegeleiding/actie/[id]] wijzigen mislukt:", error);
    return NextResponse.json({ error: "Wijzigen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
