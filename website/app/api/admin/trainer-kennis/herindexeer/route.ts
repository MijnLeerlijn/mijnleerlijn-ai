import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { herindexeerTrainerKennisversies, haalKennisRetrievalDiagnose } from "@/lib/trainers/kennis-reindex";

// Productiecontrole (2026-08-23) — opdrachtseis §2: "bouw een veilige
// backfill/reindex; zorg dat bestaande gepubliceerde records alsnog
// geïndexeerd kunnen worden... ik wil niet iedere trainerversie opnieuw
// handmatig hoeven publiceren." Admin-only (zelfde verifyAdminSessionCookie/
// isEditor-patroon als app/api/trainer-bestanden/[id]/download).
//
// POST voert de daadwerkelijke herindexering uit (schrijfactie — nieuwe
// embeddings voor gepubliceerde trainerversies die er nu geen geldige
// hebben) en geeft de tellingen terug. GET geeft uitsluitend de
// diagnose-tellingen terug (praktische diagnose, ook opdrachtseis §2)
// zonder iets te wijzigen — handig om vooraf te zien of herindexeren nodig
// is. Geen vraag-/antwoordinhoud in beide gevallen, uitsluitend tellingen.
async function verifieerAdmin(request: NextRequest, payload: Awaited<ReturnType<typeof getPayload>>) {
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) return false;
  return heeftAdminPermissie(sessieControle.user, "trainers.dashboard");
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  if (!(await verifieerAdmin(request, payload))) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  const resultaat = await herindexeerTrainerKennisversies(payload);
  return NextResponse.json(resultaat);
}

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  if (!(await verifieerAdmin(request, payload))) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  const diagnose = await haalKennisRetrievalDiagnose(payload);
  return NextResponse.json(diagnose);
}
