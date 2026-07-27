import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

const TOEGESTANE_VELDEN = ["synoniemen", "voorbeeldvragen"] as const;
type ToegestaanVeld = (typeof TOEGESTANE_VELDEN)[number];

// AI Verbetercentrum: voegt de letterlijke formulering van een
// helpdeskvraag toe als synoniem of voorbeeldvraag aan een
// kennisbasis-onderwerp — "maak van de vraag direct leerdata". Dedupliceert
// (exacte tekst, na trim) zodat herhaaldelijk klikken geen dubbele
// vermeldingen oplevert.
//
// Body: { conversationId: number; onderwerpId: number; field: "synoniemen" | "voorbeeldvragen"; text: string }.
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
  const { conversationId, onderwerpId, field, text } = (body ?? {}) as {
    conversationId?: unknown;
    onderwerpId?: unknown;
    field?: unknown;
    text?: unknown;
  };
  if (typeof conversationId !== "number" || typeof onderwerpId !== "number") {
    return NextResponse.json({ error: "conversationId en onderwerpId zijn verplicht." }, { status: 400 });
  }
  if (typeof field !== "string" || !TOEGESTANE_VELDEN.includes(field as ToegestaanVeld)) {
    return NextResponse.json({ error: `field moet 'synoniemen' of 'voorbeeldvragen' zijn.` }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is verplicht." }, { status: 400 });
  }
  const veld = field as ToegestaanVeld;
  const nieuweWaarde = text.trim();

  try {
    const [onderwerp, gesprek] = await Promise.all([
      payload.findByID({ collection: "kennisbasis-onderwerpen", id: onderwerpId, overrideAccess: true, depth: 0, disableErrors: true }),
      payload.findByID({ collection: "assistant-conversations", id: conversationId, overrideAccess: true, depth: 0, disableErrors: true }),
    ]);
    if (!onderwerp) {
      return NextResponse.json({ error: "Kennisbasis-onderwerp niet gevonden." }, { status: 404 });
    }
    if (!gesprek) {
      return NextResponse.json({ error: "Gesprek niet gevonden." }, { status: 404 });
    }

    const huidig = (onderwerp[veld] ?? []) as string[];
    const bestaatAl = huidig.some((waarde) => waarde.trim().toLowerCase() === nieuweWaarde.toLowerCase());
    const bijgewerkt = bestaatAl ? huidig : [...huidig, nieuweWaarde];

    await payload.update({
      collection: "kennisbasis-onderwerpen",
      id: onderwerpId,
      overrideAccess: true,
      data: { [veld]: bijgewerkt },
    });

    if (gesprek.verbeterStatus === "nieuw") {
      await payload.update({
        collection: "assistant-conversations",
        id: conversationId,
        overrideAccess: true,
        data: { verbeterStatus: "beoordeeld" },
      });
    }

    return NextResponse.json({ ok: true, toegevoegd: !bestaatAl });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/verbetercentrum/append-to-onderwerp] Toevoegen mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
