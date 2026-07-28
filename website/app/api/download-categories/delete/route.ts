import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Downloadcategorieën-fix (2026-07-28): categorie-relaties op handleidingen/
// knowledge-sources staan op `ON DELETE set null` (zie de migraties) — een
// verwijdering geeft dus nooit een ruwe databasefout, maar zou wél
// stilzwijgend de categorie-koppeling van nog gebruikte downloads verbreken.
// Deze route telt daarom eerst hoeveel handleidingen/knowledge-sources nog
// naar de categorie verwijzen (server-side — de client-side telling in
// DownloadcategorieenView.tsx is race-condition-gevoelig) en weigert met een
// duidelijke melding bij gebruik. Verwijdert nooit de gekoppelde downloads
// zelf, uitsluitend de categorie.
//
// Body: { id: number }.
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
  const { id } = (body ?? {}) as { id?: unknown };
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id is verplicht." }, { status: 400 });
  }

  try {
    const [handleidingen, bronnen] = await Promise.all([
      payload.count({ collection: "handleidingen", where: { categorie: { equals: id } }, overrideAccess: true }),
      payload.count({ collection: "knowledge-sources", where: { categorie: { equals: id } }, overrideAccess: true }),
    ]);
    const inGebruik = handleidingen.totalDocs + bronnen.totalDocs;
    if (inGebruik > 0) {
      return NextResponse.json(
        {
          error: `Deze categorie is nog gekoppeld aan ${inGebruik} download(s) — wijs eerst een andere categorie toe via Downloadbeheer voordat je deze verwijdert.`,
        },
        { status: 409 }
      );
    }

    await payload.delete({ collection: "categories", id, overrideAccess: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/download-categories/delete] Verwijderen mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
