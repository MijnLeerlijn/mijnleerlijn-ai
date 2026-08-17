import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { heeftGmailScopes } from "@/lib/google-gmail/oauth";
import { haalMailSignalen } from "@/lib/werk/mail-signalen";
import type { SchoolOptie } from "@/lib/werk/school-matching";

// Mijn Werk Fase 3 (2026-08-17) — compacte lijst mail die aandacht vraagt,
// zie lib/werk/mail-signalen.ts. `connected: false` dekt zowel "geen
// Google-koppeling" als "wel gekoppeld, maar (nog) geen Gmail-scope
// toegekend" (een gebruiker kan uitsluitend Agenda gekoppeld hebben) — in
// beide gevallen toont de UI dezelfde "Koppel Gmail"-CTA, geen aparte
// foutstatus nodig. Foutmeldingen naar de client blijven generiek, zelfde
// conventie als app/api/werk/agenda en .../voorbereiding.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde gebruikers mogen dit." }, { status: 403 });
  }
  const user = sessieControle.user as AuthUser;

  try {
    const toegang = await verkrijgGeldigeToegang(payload, user.id);
    if (!toegang || !heeftGmailScopes(toegang.scopes)) {
      return NextResponse.json({ connected: false, signalen: [] });
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

    const signalen = await haalMailSignalen(payload, user.id, toegang.accessToken, scholen);
    return NextResponse.json({ connected: true, signalen });
  } catch (error) {
    console.error("[api/werk/mail] mislukt:", error);
    return NextResponse.json({ error: "Mailsignalen konden niet worden opgehaald." }, { status: 500 });
  }
}
