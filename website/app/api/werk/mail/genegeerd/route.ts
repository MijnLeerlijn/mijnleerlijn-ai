import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { heeftGmailScopes } from "@/lib/google-gmail/oauth";
import { haalGenegeerdeMails } from "@/lib/werk/mail-signalen";

// Transparantieproductiecorrectie (2026-08-19) — "Bekijk genegeerde mails":
// uitsluitend aangeroepen na een expliciete klik (nooit bij een gewone
// dashboardlezing, zie SalesDashboardPaneel.tsx) — dit blijft dus een apart,
// lui-geladen endpoint i.p.v. onderdeel van GET /api/werk/mail, precies om
// Mijn Dag niet in een volledige inbox te veranderen (opdrachtseis).
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
      return NextResponse.json({ genegeerdeMails: [] });
    }

    const genegeerdeMails = await haalGenegeerdeMails(payload, user.id, toegang.accessToken);
    return NextResponse.json({ genegeerdeMails });
  } catch (error) {
    console.error("[api/werk/mail/genegeerd] mislukt:", error);
    return NextResponse.json({ error: "Genegeerde mails konden niet worden opgehaald." }, { status: 500 });
  }
}
