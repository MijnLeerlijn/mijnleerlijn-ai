import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Downloadcategorieën-fix (2026-07-28): Categories.ts staat `update:
// centralEditorOnly` — een rechtstreekse PATCH via de admin-UI werkte tot nu
// toe niet doordat Payload's cookie-CSRF-check de sessie verwierp (zie de
// NEXT_PUBLIC_SERVER_URL-fix). Deze route is, los van die fix, een extra,
// smalle beheerroute die uitsluitend de titel van een downloadcategorie mag
// wijzigen — analoog aan app/api/knowledge-sources/download-settings.
//
// Body: { id: number; title: string }.
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

  const TOEGESTANE_VELDEN = new Set(["id", "title"]);
  const onbekendeSleutel = Object.keys(body as Record<string, unknown>).find(
    (sleutel) => !TOEGESTANE_VELDEN.has(sleutel)
  );
  if (onbekendeSleutel) {
    return NextResponse.json(
      { error: `Veld '${onbekendeSleutel}' mag niet via deze route gewijzigd worden.` },
      { status: 400 }
    );
  }

  const { id, title } = body as { id?: unknown; title?: unknown };
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id is verplicht." }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is verplicht en mag niet leeg zijn." }, { status: 400 });
  }

  try {
    await payload.update({
      collection: "categories",
      id,
      overrideAccess: true,
      data: { title: title.trim() },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/download-categories/rename] Hernoemen mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
