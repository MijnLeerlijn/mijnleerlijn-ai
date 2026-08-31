import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { koppelTrainerAanSchool } from "@/lib/trainers/startbegeleiding";

// Startbegeleiding-ronde (2026-09-02, spec §E.2) — Actie 2 "Koppel een
// trainer": de enige ECHTE Monday-schrijving in Startbegeleiding (spec §H —
// geen lokale kopie van de koppeling). `trainerId` is bewust het Payload-ID
// (niet het rauwe Monday-uitvoerder-item-ID) — nooit een client-aangeleverd
// Monday-ID vertrouwen voor een schrijfactie, hetzelfde principe als
// actie/route.ts hiernaast: het Payload-traineraccount is de enige bron van
// waarheid voor "welk Monday-item hoort bij deze trainer"
// (mondayUitvoerderItemId), hier server-side opgezocht.
interface PostBody {
  mondaySchoolId?: string;
  trainerId?: number;
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.startbegeleiding")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (typeof body.mondaySchoolId !== "string" || body.mondaySchoolId.length === 0) {
    return NextResponse.json({ error: "Ongeldig of ontbrekend school-ID." }, { status: 400 });
  }
  if (!Number.isInteger(body.trainerId) || (body.trainerId as number) <= 0) {
    return NextResponse.json({ error: "Kies een trainer." }, { status: 400 });
  }

  const trainer = await payload.findByID({ collection: "trainer-accounts", id: body.trainerId as number, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!trainer) {
    return NextResponse.json({ error: "Onbekende trainer." }, { status: 400 });
  }

  const uitkomst = await koppelTrainerAanSchool(body.mondaySchoolId, trainer.mondayUitvoerderItemId);
  switch (uitkomst.soort) {
    case "al_gekoppeld":
      return NextResponse.json({ soort: "al_gekoppeld", boodschap: `${trainer.name} is al gekoppeld aan deze school.` });
    case "gekoppeld":
      return NextResponse.json({ soort: "gekoppeld", boodschap: `${trainer.name} is gekoppeld aan deze school.` });
    case "niet_geactiveerd":
      return NextResponse.json({ soort: "niet_geactiveerd", boodschap: uitkomst.boodschap }, { status: 409 });
    case "mislukt":
      return NextResponse.json({ soort: "mislukt", boodschap: uitkomst.boodschap }, { status: 502 });
  }
}
