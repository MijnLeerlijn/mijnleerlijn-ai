import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

interface NieuwOnderwerpInvoer {
  onderwerp?: unknown;
  doel?: unknown;
  officieleTerm?: unknown;
  synoniemen?: unknown;
  voorbeeldvragen?: unknown;
  toelichting?: unknown;
  gekoppeldeHandleidingen?: unknown;
  verduidelijkingsvraag?: unknown;
  prioriteit?: unknown;
}

// AI Verbetercentrum: maakt een nieuw kennisbasis-onderwerp aan vanuit een
// helpdeskgesprek (de beheerder heeft dit vooraf in het Verbetercentrum
// gecontroleerd/aangepast) en koppelt het gesprek er meteen aan — zelfde
// koppel-logica als link-onderwerp/route.ts.
//
// Veiligheidsnet naast de review-stap in de UI: `status` uit de aanvraag
// wordt hier ALTIJD genegeerd — een nieuw onderwerp wordt server-side
// onvoorwaardelijk als "concept" aangemaakt, nooit direct gepubliceerd.
//
// Body: { conversationId: number; onderwerp: { onderwerp, officieleTerm, ... } }.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { conversationId, onderwerp } = (body ?? {}) as {
    conversationId?: unknown;
    onderwerp?: NieuwOnderwerpInvoer;
  };
  if (typeof conversationId !== "number") {
    return NextResponse.json({ error: "conversationId is verplicht." }, { status: 400 });
  }
  if (!onderwerp || typeof onderwerp.onderwerp !== "string" || !onderwerp.onderwerp.trim()) {
    return NextResponse.json({ error: "onderwerp.onderwerp is verplicht." }, { status: 400 });
  }
  if (typeof onderwerp.officieleTerm !== "string" || !onderwerp.officieleTerm.trim()) {
    return NextResponse.json({ error: "onderwerp.officieleTerm is verplicht." }, { status: 400 });
  }

  try {
    const gesprek = await payload.findByID({
      collection: "assistant-conversations",
      id: conversationId,
      overrideAccess: true,
      depth: 0,
      disableErrors: true,
    });
    if (!gesprek) {
      return NextResponse.json({ error: "Gesprek niet gevonden." }, { status: 404 });
    }

    const nieuwOnderwerp = await payload.create({
      collection: "kennisbasis-onderwerpen",
      overrideAccess: true,
      data: {
        onderwerp: onderwerp.onderwerp.trim(),
        doel: typeof onderwerp.doel === "string" ? onderwerp.doel : undefined,
        officieleTerm: onderwerp.officieleTerm.trim(),
        synoniemen: Array.isArray(onderwerp.synoniemen) ? onderwerp.synoniemen.filter((s) => typeof s === "string") : [],
        voorbeeldvragen: Array.isArray(onderwerp.voorbeeldvragen)
          ? onderwerp.voorbeeldvragen.filter((v) => typeof v === "string")
          : [],
        toelichting: typeof onderwerp.toelichting === "string" ? onderwerp.toelichting : undefined,
        gekoppeldeHandleidingen: Array.isArray(onderwerp.gekoppeldeHandleidingen) ? onderwerp.gekoppeldeHandleidingen : [],
        verduidelijkingsvraag:
          typeof onderwerp.verduidelijkingsvraag === "string" ? onderwerp.verduidelijkingsvraag : undefined,
        prioriteit: typeof onderwerp.prioriteit === "number" ? onderwerp.prioriteit : undefined,
        // Bewust ongeacht client-invoer: zie bestandscommentaar hierboven.
        status: "concept",
      },
    });

    await payload.update({
      collection: "assistant-conversations",
      id: conversationId,
      overrideAccess: true,
      data: {
        kennisbasisOnderwerp: nieuwOnderwerp.id,
        gebruikteOfficieleTerm: nieuwOnderwerp.officieleTerm,
        verbeterStatus: gesprek.verbeterStatus === "nieuw" ? "beoordeeld" : gesprek.verbeterStatus,
      },
    });

    return NextResponse.json({ ok: true, onderwerpId: nieuwOnderwerp.id });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/verbetercentrum/create-onderwerp] Aanmaken mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
