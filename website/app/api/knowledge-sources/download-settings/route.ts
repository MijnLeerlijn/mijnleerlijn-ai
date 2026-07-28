import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Downloadbeheer-fix (2026-07-28): KnowledgeSources.ts staat `update:
// adminOnly` — bewust dichtgetimmerd voor de PDF-brondocumenten als geheel
// (titel/bestand/beschrijving/etc.). DownloadbeheerView.tsx PATCHte tot nu
// toe rechtstreeks naar /api/knowledge-sources/:id, wat voor elke
// redacteur (niet-admin) een 403 gaf zodra die de downloadinstelling van
// een PDF probeerde te wijzigen — zie het onderzoek naar "1 van 1
// wijziging(en) konden niet opgeslagen worden".
//
// Bewust GEEN verruiming van KnowledgeSources.ts's algemene update-access
// (dat zou ook titel/bestand/beschrijving openstellen voor elke redacteur).
// In plaats daarvan: deze smalle, eigen route met `overrideAccess: true`,
// die uitsluitend de twee downloadinstellingen mag wijzigen — analoog aan
// de app/api/verbetercentrum/*-routes.
// Titel + volgorde (2026-07-28): Downloadbeheer beheert nu ook de publieke
// titel en sorteervolgorde van PDF-bronnen vanuit dezelfde ene, gecontroleerde
// route — de losse, admin-only PATCH naar /api/knowledge-sources/:id voor
// `volgorde` (met een stille .catch()) is vervallen, zie DownloadbeheerView.tsx.
const TOEGESTANE_VELDEN = new Set(["id", "downloadVisible", "downloadCategory", "title", "volgorde"]);

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  // Expliciete velden-allowlist: elk veld buiten TOEGESTANE_VELDEN wordt
  // geweigerd, ook als de waarde er verder geldig uitziet — deze route mag
  // structureel niets anders kunnen wijzigen.
  const onbekendeSleutel = Object.keys(body as Record<string, unknown>).find(
    (sleutel) => !TOEGESTANE_VELDEN.has(sleutel)
  );
  if (onbekendeSleutel) {
    return NextResponse.json(
      { error: `Veld '${onbekendeSleutel}' mag niet via deze route gewijzigd worden.` },
      { status: 400 }
    );
  }

  const { id, downloadVisible, downloadCategory, title, volgorde } = body as {
    id?: unknown;
    downloadVisible?: unknown;
    downloadCategory?: unknown;
    title?: unknown;
    volgorde?: unknown;
  };

  if (typeof id !== "number") {
    return NextResponse.json({ error: "id is verplicht." }, { status: 400 });
  }
  if (
    downloadVisible === undefined &&
    downloadCategory === undefined &&
    title === undefined &&
    volgorde === undefined
  ) {
    return NextResponse.json(
      { error: "downloadVisible, downloadCategory, title en/of volgorde is verplicht." },
      { status: 400 }
    );
  }
  if (downloadVisible !== undefined && typeof downloadVisible !== "boolean") {
    return NextResponse.json({ error: "downloadVisible moet een boolean zijn." }, { status: 400 });
  }
  if (downloadCategory !== undefined && downloadCategory !== null && typeof downloadCategory !== "number") {
    return NextResponse.json({ error: "downloadCategory moet een getal of null zijn." }, { status: 400 });
  }
  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return NextResponse.json({ error: "title moet een niet-lege tekst zijn." }, { status: 400 });
  }
  if (volgorde !== undefined && volgorde !== null && typeof volgorde !== "number") {
    return NextResponse.json({ error: "volgorde moet een getal of null zijn." }, { status: 400 });
  }

  // Handmatig opgebouwd, nooit een spread van de ruwe body — zo kan deze
  // schrijfactie structureel nooit meer dan deze velden raken, ook al zou
  // de validatie hierboven ooit een gat vertonen.
  const data: Record<string, unknown> = {};
  if (downloadVisible !== undefined) data.zichtbaar = downloadVisible;
  if (downloadCategory !== undefined) data.categorie = downloadCategory;
  if (title !== undefined) data.title = (title as string).trim();
  if (volgorde !== undefined) data.volgorde = volgorde;

  try {
    await payload.update({
      collection: "knowledge-sources",
      id,
      overrideAccess: true,
      data,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/knowledge-sources/download-settings] Opslaan mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
