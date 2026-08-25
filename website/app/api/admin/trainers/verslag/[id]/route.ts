import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { wijzigVerslagAlsAdmin, verwijderVerslagAlsAdmin } from "@/lib/trainers/verslag";

// Admin Schooldetail/Trainerdetail — Verslagen (vervolgronde) — een
// beheerder mag de verslagtekst van een BESTAAND trainingsverslag bewerken/
// verwijderen. Admin-auth (verifyAdminSessionCookie), NOOIT de
// trainercookie — zelfde patroon als app/api/admin/trainers/logboek/[id]/
// route.ts. `id` in de URL is het Payload-ID van het trainingsverslag zelf.
// PATCH accepteert UITSLUITEND definitieveTekst — nooit school/trainer/
// training/bron/status/writeback-velden (zie lib/trainers/verslag.ts se
// toelichting bij wijzigVerslagAlsAdmin voor de volledige writeback-analyse).
interface PatchBody {
  definitieveTekst?: string;
}

async function geauthenticeerdeBeheerder(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) return null;
  return payload;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const verslagId = Number(id);
  if (!Number.isInteger(verslagId)) {
    return NextResponse.json({ error: "Ongeldig verslag-ID." }, { status: 400 });
  }

  const payload = await geauthenticeerdeBeheerder(request);
  if (!payload) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (typeof body.definitieveTekst !== "string") {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    const uitkomst = await wijzigVerslagAlsAdmin(payload, verslagId, { definitieveTekst: body.definitieveTekst });

    if (uitkomst.soort === "niet_gevonden") {
      return NextResponse.json({ error: "Verslag niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "ongeldige_invoer") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json({ verslag: uitkomst.verslag });
  } catch (error) {
    console.error("[api/admin/trainers/verslag/[id]] bewerken mislukt:", error);
    return NextResponse.json({ error: "Bewerken mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const verslagId = Number(id);
  if (!Number.isInteger(verslagId)) {
    return NextResponse.json({ error: "Ongeldig verslag-ID." }, { status: 400 });
  }

  const payload = await geauthenticeerdeBeheerder(request);
  if (!payload) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  try {
    const uitkomst = await verwijderVerslagAlsAdmin(payload, verslagId);
    if (uitkomst === "niet_gevonden") {
      return NextResponse.json({ error: "Verslag niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/admin/trainers/verslag/[id]] verwijderen mislukt:", error);
    return NextResponse.json({ error: "Verwijderen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
