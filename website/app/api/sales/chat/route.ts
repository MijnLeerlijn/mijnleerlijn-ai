import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { stelVraagOverAlleScholen } from "@/lib/sales/aggregate-chat";

// Sales UX-ronde 3 (2026-08-14) — "Vraag" tab, modus "Alle scholen". Bewust
// een APARTE route van app/api/sales/school/[id]/chat (niet samengevoegd
// achter een optioneel schoolId-veld) — twee losse, elk simpele endpoints is
// veiliger en makkelijker te auditeren dan één route die op basis van een
// body-veld tussen twee volledig verschillende contextopbouwen kiest.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { vraag?: string };
    if (!body.vraag || !body.vraag.trim()) {
      return NextResponse.json({ error: "vraag is verplicht." }, { status: 400 });
    }

    const resultaat = await stelVraagOverAlleScholen(payload, body.vraag);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/chat] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
