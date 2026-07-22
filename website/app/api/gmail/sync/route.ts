import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, type AuthUser } from "@/payload/access/roles";
import { syncGmailThreads } from "@/lib/gmail/sync";

// Start een Gmail-synchronisatieronde — zie lib/gmail/sync.ts voor de
// daadwerkelijke logica. In tegenstelling tot app/api/gmail/oauth/callback
// is dit een GEWONE same-origin aanvraag (de "Test synchronisatie"-knop in
// Payload's admin-UI doet een fetch() vanuit /admin zelf), dus de normale
// payload.auth()-sessiecontrole werkt hier gewoon correct — zie het
// commentaar in de callback-route voor waarom dat daar niet kan.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });

  if (!isAdmin(user as AuthUser | null)) {
    return NextResponse.json(
      { error: "Alleen beheerders mogen een synchronisatie starten." },
      { status: 403 }
    );
  }

  try {
    const resultaat = await syncGmailThreads(payload);
    // Alleen aantallen + technische foutmeldingen (nooit berichtinhoud) —
    // zie docs/SECURITY-AND-PRIVACY.md.
    payload.logger.info(
      `[api/gmail/sync] gevonden=${resultaat.gevonden} nieuw=${resultaat.nieuw} bijgewerkt=${resultaat.bijgewerkt} overgeslagen=${resultaat.overgeslagen} mislukt=${resultaat.mislukt}`
    );
    if (resultaat.fouten.length > 0) {
      payload.logger.warn(resultaat.fouten, "[api/gmail/sync] fouten per thread-id");
    }
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/gmail/sync] Synchronisatie mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
