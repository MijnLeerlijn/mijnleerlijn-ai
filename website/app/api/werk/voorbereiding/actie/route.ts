import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { dempSignaal, maakVoorbereidingstaak, herinnerMorgen, type VoorbereidingEventContext } from "@/lib/werk/voorbereiding";

const DATUM_PATROON = /^\d{4}-\d{2}-\d{2}$/;
const TOEGESTANE_ACTIES = ["dempen", "taak", "herinner_morgen"] as const;
type Actie = (typeof TOEGESTANE_ACTIES)[number];

interface ActieBody {
  actie?: string;
  eventId?: string;
  eventStart?: string;
  eventTitel?: string;
  schoolId?: number | null;
  /** Verplicht bij actie "taak"/"herinner_morgen" — de dag waarop de taak verschijnt (standaard "vandaag" resp. "morgen" in de client). */
  datum?: string;
  /** Alleen bij actie "taak" — titel/beschrijving-override na een geaccepteerd AI-voorstel (lib/werk/voorbereiding-ai.ts). Zonder override: generieke "Voorbereiden: <titel>". */
  taakTitel?: string;
  taakBeschrijving?: string;
}

// Mijn Werk Fase 2 (2026-08-17) — de drie NIET-AI-acties op een
// voorbereidingskaart: "Ik ben al voorbereid" (dempen), "Maak
// voorbereidingstaak" (taak) en "Herinner morgen" (herinner_morgen). Het
// AI-voorstelpad (app/api/werk/voorbereiding/ai-voorstel) is een aparte
// route — expliciet-klik-only en met eigen contextminimalisatie/rate
// limiting, hoort niet in dit lichte, deterministische pad.
//
// Geen automatische taak zonder deze expliciete aanroep (opdrachtseis) — elke
// van de drie acties is precies één knop-klik, nooit een achtergrondproces.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde gebruikers mogen dit." }, { status: 403 });
  }
  const user = sessieControle.user as AuthUser;

  let body: ActieBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const { actie, eventId, eventStart, eventTitel, schoolId, datum, taakTitel, taakBeschrijving } = body;
  if (!actie || !TOEGESTANE_ACTIES.includes(actie as Actie) || !eventId || !eventStart || !eventTitel) {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  if ((actie === "taak" || actie === "herinner_morgen") && (!datum || !DATUM_PATROON.test(datum))) {
    return NextResponse.json({ error: "Ongeldige of ontbrekende datum." }, { status: 400 });
  }

  const eventContext: VoorbereidingEventContext = {
    eventId,
    eventStart,
    eventTitel,
    schoolId: typeof schoolId === "number" ? schoolId : null,
  };

  try {
    if (actie === "dempen") {
      await dempSignaal(payload, user.id, eventContext);
      return NextResponse.json({ ok: true });
    }

    if (actie === "taak") {
      const { taakId } = await maakVoorbereidingstaak(payload, user.id, eventContext, datum!, {
        titel: taakTitel,
        beschrijving: taakBeschrijving,
      });
      return NextResponse.json({ ok: true, taakId });
    }

    // actie === "herinner_morgen"
    const { taakId } = await herinnerMorgen(payload, user.id, eventContext, datum!);
    return NextResponse.json({ ok: true, taakId });
  } catch (error) {
    console.error("[api/werk/voorbereiding/actie] mislukt:", error);
    return NextResponse.json({ error: "Actie kon niet worden uitgevoerd. Probeer het opnieuw." }, { status: 500 });
  }
}
