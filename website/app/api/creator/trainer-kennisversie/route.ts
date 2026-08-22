import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { genereerTrainerversie } from "@/lib/creator/trainer-kennisversie";

// Vervolgronde (2026-08-22) — "Maak trainerversie" (MaakTrainerversieButton.tsx
// op Articles.ts). Roept alleen de AI-herschrijving aan en geeft titel/tekst
// terug; de aanroeper slaat het resultaat zelf op als trainer-kennisversies-
// record via Payload's eigen REST-API (geen duplicaat schrijfpad hier) —
// zelfde opzet als /api/creator/variant-adapt. I.t.t. die route krijgt deze
// alleen een articleId: het bronartikel wordt hier server-side opgehaald
// (depth:1 voor category.title) i.p.v. door de aanroeper al meegegeven — de
// aanroeper is een kale admin-documentknop, geen workspace die het artikel
// al in eigen state heeft.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { articleId?: number | string };
    if (!body.articleId) {
      return NextResponse.json({ error: "articleId is verplicht." }, { status: 400 });
    }

    const artikel = await payload.findByID({ collection: "articles", id: body.articleId, depth: 1, overrideAccess: true }).catch(() => null);
    if (!artikel) {
      return NextResponse.json({ error: "Bronartikel niet gevonden." }, { status: 404 });
    }

    const resultaat = await genereerTrainerversie({
      title: artikel.title,
      summary: artikel.summary,
      tags: artikel.tags,
      categoryTitle: typeof artikel.category === "object" && artikel.category ? artikel.category.title : null,
      sections: (artikel.sections ?? []).map((sectie) => ({
        title: sectie.title,
        blocks: (sectie.blocks ?? []).map((blok) => ({
          blockType: blok.blockType,
          body: "body" in blok ? blok.body : undefined,
          caption: "caption" in blok ? blok.caption : undefined,
          label: "label" in blok ? blok.label : undefined,
        })),
      })),
    });

    return NextResponse.json({ ...resultaat, sourceArticleId: artikel.id });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/creator/trainer-kennisversie] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
