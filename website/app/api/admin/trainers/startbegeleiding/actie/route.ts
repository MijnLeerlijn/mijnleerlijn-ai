import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { maakStartactie, STARTACTIE_LABEL, type StartactieType } from "@/lib/trainers/startbegeleiding";

// Startbegeleiding-ronde (2026-09-02, spec §E.1) — Actie 1 "Nog iets nodig
// voor de start": lichte taak, geen Monday-schrijving (i.t.t. koppel/route.ts
// hiernaast). mondaySchoolId/schoolNaam komen rechtstreeks uit de body i.p.v.
// hier opnieuw live bij Monday te bevestigen — dezelfde vertrouwensgrens als
// elke andere admin-schrijfroute die al een schoolId/schoolNaam-paar
// doorgeeft (bv. app/api/admin/trainers/logboek-routes): de admin keek dit
// net op de eigen schooldetailpagina na, een extra Monday-round-trip hier
// voegt geen echte veiligheid toe (spec §H: geen extra Monday-verkeer zonder
// noodzaak) — trainerId wordt WEL server-side geverifieerd (payload.findByID
// binnen maakStartactie zelf gooit anders een fout).
interface PostBody {
  mondaySchoolId?: string;
  schoolNaam?: string | null;
  trainerId?: number;
  actieType?: string;
  instructie?: string | null;
  deadline?: string;
  gespreksDatum?: string | null;
}

const MAX_INSTRUCTIE_LENGTE = 1000;

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
  if (typeof body.actieType !== "string" || !(Object.keys(STARTACTIE_LABEL) as string[]).includes(body.actieType)) {
    return NextResponse.json({ error: "Kies een geldig actietype." }, { status: 400 });
  }
  if (typeof body.deadline !== "string" || body.deadline.length === 0) {
    return NextResponse.json({ error: "Kies een deadline." }, { status: 400 });
  }
  if (body.instructie !== undefined && body.instructie !== null && (typeof body.instructie !== "string" || body.instructie.length > MAX_INSTRUCTIE_LENGTE)) {
    return NextResponse.json({ error: `Instructie mag maximaal ${MAX_INSTRUCTIE_LENGTE} tekens zijn.` }, { status: 400 });
  }
  if (body.gespreksDatum !== undefined && body.gespreksDatum !== null && typeof body.gespreksDatum !== "string") {
    return NextResponse.json({ error: "Ongeldige gespreksdatum." }, { status: 400 });
  }

  const trainer = await payload.findByID({ collection: "trainer-accounts", id: body.trainerId as number, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!trainer) {
    return NextResponse.json({ error: "Onbekende trainer." }, { status: 400 });
  }

  try {
    const actie = await maakStartactie(payload, {
      mondaySchoolId: body.mondaySchoolId,
      schoolNaam: body.schoolNaam ?? null,
      trainerId: body.trainerId as number,
      actieType: body.actieType as StartactieType,
      instructie: body.instructie ?? null,
      deadline: body.deadline,
      gespreksDatum: body.gespreksDatum ?? null,
    });
    return NextResponse.json({ actie });
  } catch (error) {
    console.error("[api/admin/trainers/startbegeleiding/actie] aanmaken mislukt:", error);
    return NextResponse.json({ error: "Actie aanmaken mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
