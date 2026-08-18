import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { dempSignaal, maakMailTaak, toonSignaalToch } from "@/lib/werk/mail-signalen";

const DATUM_PATROON = /^\d{4}-\d{2}-\d{2}$/;
const TOEGESTANE_ACTIES = ["dempen", "taak", "toch_tonen"] as const;
type Actie = (typeof TOEGESTANE_ACTIES)[number];

interface ActieBody {
  actie?: string;
  signaalId?: number;
  taakTitel?: string;
  taakBeschrijving?: string;
  datum?: string;
}

// Mijn Werk Fase 3 (2026-08-17) — de twee NIET-AI-acties op een mailkaart:
// "Niet relevant" (dempen) en "Maak taak" (taak, volledig deterministisch —
// titel/reden komen van de al-gecachete classificatie, zie
// lib/werk/mail-signalen.ts se toelichting, de gebruiker bevestigt altijd
// eerst). "Maak antwoordvoorstel"/"Verstuur" zijn aparte routes (AI resp.
// een echte Gmail-send) — horen niet in dit lichte, deterministische pad.
//
// Transparantieproductiecorrectie (2026-08-19) — derde actie "toch_tonen":
// de tegenhanger van "dempen", vanuit de "Bekijk genegeerde mails"-diagnose
// (app/api/werk/mail/genegeerd). Corrigeert een fout-negatieve
// AI-classificatie (niet_relevant → gesignaleerd) — ook volledig
// deterministisch, geen nieuwe AI-aanroep.
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

  const { actie, signaalId, taakTitel, taakBeschrijving, datum } = body;
  if (!actie || !TOEGESTANE_ACTIES.includes(actie as Actie) || typeof signaalId !== "number") {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  if (actie === "taak" && (!taakTitel?.trim() || !datum || !DATUM_PATROON.test(datum))) {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    if (actie === "dempen") {
      const ok = await dempSignaal(payload, user.id, signaalId);
      if (!ok) return NextResponse.json({ error: "Signaal niet gevonden." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    if (actie === "toch_tonen") {
      const ok = await toonSignaalToch(payload, user.id, signaalId);
      if (!ok) return NextResponse.json({ error: "Signaal niet gevonden of niet langer genegeerd." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // actie === "taak"
    const resultaat = await maakMailTaak(payload, user.id, signaalId, {
      titel: taakTitel!.trim(),
      beschrijving: taakBeschrijving?.trim(),
      datum: datum!,
    });
    if (!resultaat) return NextResponse.json({ error: "Signaal niet gevonden." }, { status: 404 });
    return NextResponse.json({ ok: true, taakId: resultaat.taakId });
  } catch (error) {
    console.error("[api/werk/mail/actie] mislukt:", error);
    return NextResponse.json({ error: "Actie kon niet worden uitgevoerd. Probeer het opnieuw." }, { status: 500 });
  }
}
