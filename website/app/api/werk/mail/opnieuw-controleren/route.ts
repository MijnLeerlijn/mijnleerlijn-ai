import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { heeftGmailScopes } from "@/lib/google-gmail/oauth";
import { haalMailSignalen } from "@/lib/werk/mail-signalen";
import type { SchoolOptie } from "@/lib/werk/school-matching";
import { maakRateLimiter } from "@/lib/contact/validate";

// Vijf per minuut per gebruiker — dit is een expliciete-klik-only actie die
// (in tegenstelling tot de gewone GET /api/werk/mail) OOK al-geclassificeerde
// kandidaten opnieuw laat beoordelen, dus potentieel een grotere
// AI-batchaanroep dan de normale dashboardlezing. Zelfde limietconventie
// als de andere expliciete AI-routes in Mijn Werk.
const beperkAanvragen = maakRateLimiter(60_000, 5);

// Productiecorrectie (2026-08-18) — "Mail opnieuw controleren": herclassificeert
// alle kandidaten in het huidige venster (zie lib/werk/mail-signalen.ts se
// MAIL_LOOKBACK_DAGEN), inclusief eerder "niet_relevant" gecachete berichten
// — bedoeld om fout-negatieven te herstellen (bv. na de brede-kandidaatquery-
// fix, of na een eerdere classificatiestoring). Laat berichten met een
// bewuste gebruikersstatus (gedempt/taak_aangemaakt/beantwoord) met rust.
// Geeft een compacte samenvatting terug voor directe terugkoppeling in de UI.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde gebruikers mogen dit." }, { status: 403 });
  }
  const user = sessieControle.user as AuthUser;

  if (!beperkAanvragen.magVerder(String(user.id))) {
    return NextResponse.json({ error: "Te veel aanvragen — probeer het over een minuut opnieuw." }, { status: 429 });
  }

  try {
    const toegang = await verkrijgGeldigeToegang(payload, user.id);
    if (!toegang || !heeftGmailScopes(toegang.scopes)) {
      return NextResponse.json({ error: "Geen actieve Gmail-koppeling." }, { status: 409 });
    }

    const scholenResultaat = await payload.find({
      collection: "sales-schools",
      where: { actief: { not_equals: false } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    });
    const scholen: SchoolOptie[] = (scholenResultaat.docs as unknown as { id: number; schoolName: string }[]).map((s) => ({
      id: s.id,
      schoolName: s.schoolName,
    }));

    const resultaat = await haalMailSignalen(payload, user.id, toegang.accessToken, scholen, { forceerHerclassificatie: true });
    return NextResponse.json(resultaat);
  } catch (error) {
    console.error("[api/werk/mail/opnieuw-controleren] mislukt:", error);
    return NextResponse.json({ error: "Opnieuw controleren mislukt. Probeer het later opnieuw." }, { status: 500 });
  }
}
