import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { heeftGmailScopes } from "@/lib/google-gmail/oauth";
import { haalBerichtVoorAntwoord, verstuurAntwoord } from "@/lib/google-gmail/api";
import { haalSignaalVoorAntwoord, markeerBeantwoord } from "@/lib/werk/mail-signalen";
import { maakRateLimiter } from "@/lib/contact/validate";

const beperkAanvragen = maakRateLimiter(60_000, 10);

interface Body {
  signaalId?: number;
  bodyText?: string;
}

// Mijn Werk Fase 3 (2026-08-17) — daadwerkelijk versturen. Uitsluitend
// aangeroepen ná de expliciete "Verstuur"-bevestiging in de UI (een
// client-side bevestigingsstap — deze route zelf voert geen tweede
// bevestiging uit, dat is UI-verantwoordelijkheid, niet transport).
//
// Haalt afzender/onderwerp/threading-headers OPNIEUW, gezaghebbend, bij
// Gmail op — zelfde principe als app/api/werk/voorbereiding/ai-voorstel se
// "nooit de client se eigen titel/beschrijving vertrouwen": uitsluitend de
// berichttekst zelf komt van de client, want dat is precies wat de
// gebruiker mocht bewerken. Zo kan een gemanipuleerde/verouderde client-
// waarde nooit de ontvanger of de threading laten afwijken van het
// daadwerkelijke origineel.
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

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  if (typeof body.signaalId !== "number" || !body.bodyText?.trim()) {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    const signaal = await haalSignaalVoorAntwoord(payload, user.id, body.signaalId);
    if (!signaal) {
      return NextResponse.json({ error: "Signaal niet gevonden." }, { status: 404 });
    }

    const toegang = await verkrijgGeldigeToegang(payload, user.id);
    if (!toegang || !heeftGmailScopes(toegang.scopes)) {
      return NextResponse.json({ error: "Geen actieve Gmail-koppeling." }, { status: 409 });
    }

    const origineel = await haalBerichtVoorAntwoord(toegang.accessToken, signaal.gmailMessageId);

    await verstuurAntwoord(toegang.accessToken, {
      oorspronkelijkeAfzender: origineel.van,
      onderwerp: origineel.onderwerp,
      bodyText: body.bodyText.trim(),
      gmailThreadId: origineel.gmailThreadId,
      inReplyToMessageId: origineel.messageIdHeader,
      referencesHeader: origineel.referencesHeader,
    });

    await markeerBeantwoord(payload, user.id, body.signaalId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/werk/mail/versturen] mislukt:", error);
    return NextResponse.json({ error: "Versturen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
