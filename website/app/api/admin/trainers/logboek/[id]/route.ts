import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { wijzigLogboekItemAlsAdmin, verwijderLogboekItemAlsAdmin, LOGBOEK_TYPES } from "@/lib/trainers/logboek";

// Correctieronde Admin Traineromgeving (2026-08-25, spec §2) — een beheerder
// mag een bestaand HANDMATIG logboekitem bewerken/verwijderen op Admin →
// Trainers → School → Logboek. Admin-auth (verifyAdminSessionCookie), NOOIT
// de trainercookie (spec: "traineraccount krijgt hierdoor géén nieuwe
// wijzig-/verwijderrechten") — zelfde patroon als app/api/admin/trainers/
// school/route.ts. `id` in de URL is het Payload-ID van het logboekitem zelf
// — school/trainer worden hier bewust NOOIT uit de request-body gelezen (zie
// lib/trainers/logboek.ts se toelichting): PATCH accepteert uitsluitend
// type/occurredAt/tekst.
interface PatchBody {
  type?: string;
  occurredAt?: string;
  tekst?: string;
}

async function geauthenticeerdeBeheerder(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) return null;
  return payload;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const logboekItemId = Number(id);
  if (!Number.isInteger(logboekItemId)) {
    return NextResponse.json({ error: "Ongeldig logboekitem-ID." }, { status: 400 });
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

  if (body.type !== undefined && (typeof body.type !== "string" || !(LOGBOEK_TYPES as readonly string[]).includes(body.type))) {
    return NextResponse.json({ error: "Kies een geldig type." }, { status: 400 });
  }
  if (body.occurredAt !== undefined && (typeof body.occurredAt !== "string" || body.occurredAt.length === 0)) {
    return NextResponse.json({ error: "Kies een geldige datum/tijd." }, { status: 400 });
  }
  if (body.tekst !== undefined && typeof body.tekst !== "string") {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    const uitkomst = await wijzigLogboekItemAlsAdmin(payload, logboekItemId, {
      type: body.type as (typeof LOGBOEK_TYPES)[number] | undefined,
      occurredAt: body.occurredAt,
      tekst: body.tekst,
    });

    if (uitkomst.soort === "niet_gevonden") {
      return NextResponse.json({ error: "Logboekitem niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "ongeldige_invoer") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json({ item: uitkomst.item });
  } catch (error) {
    console.error("[api/admin/trainers/logboek/[id]] bewerken mislukt:", error);
    return NextResponse.json({ error: "Bewerken mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const logboekItemId = Number(id);
  if (!Number.isInteger(logboekItemId)) {
    return NextResponse.json({ error: "Ongeldig logboekitem-ID." }, { status: 400 });
  }

  const payload = await geauthenticeerdeBeheerder(request);
  if (!payload) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  try {
    const uitkomst = await verwijderLogboekItemAlsAdmin(payload, logboekItemId);
    if (uitkomst === "niet_gevonden") {
      return NextResponse.json({ error: "Logboekitem niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/admin/trainers/logboek/[id]] verwijderen mislukt:", error);
    return NextResponse.json({ error: "Verwijderen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
