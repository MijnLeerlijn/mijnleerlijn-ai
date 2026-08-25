import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { adapteerVoorVariant } from "@/lib/creator/variant-adapt";

// Creator V1 (2026-08-13) — "Maak [variant]-versie". Roept alleen de
// AI-aanpassing aan; de aanroeper (CreatorView.tsx) slaat het resultaat zelf
// op als variant-overrides-record via Payload's eigen REST-API (geen
// duplicaat schrijfpad hier) — zie D in het technisch voorstel.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  // Admin gebruikersbeheer (2026-08-25) — permissiecheck naast de bestaande rolcheck.
  if (!heeftAdminPermissie(sessieControle.user, "creator.creator")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      masterTitel: string;
      masterTekst: string;
      targetVariantId: string;
      targetVariantNaam: string;
      terminologyDictionary?: { centralTerm: string; variantTerm: string }[];
    };

    if (!body.masterTitel || !body.masterTekst || !body.targetVariantId || !body.targetVariantNaam) {
      return NextResponse.json({ error: "masterTitel, masterTekst, targetVariantId en targetVariantNaam zijn verplicht." }, { status: 400 });
    }

    const resultaat = await adapteerVoorVariant(payload, {
      masterTitel: body.masterTitel,
      masterTekst: body.masterTekst,
      targetVariantId: body.targetVariantId,
      targetVariantNaam: body.targetVariantNaam,
      terminologyDictionary: body.terminologyDictionary ?? [],
    });
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/creator/variant-adapt] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
