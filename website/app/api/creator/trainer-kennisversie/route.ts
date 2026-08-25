import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { genereerTrainerversie, genereerTrainerversieVanTekst } from "@/lib/creator/trainer-kennisversie";
import { isAchtergrondDocument } from "@/lib/assistant/kennisbasis-context";

// Vervolgronde (2026-08-22) — "Maak trainerversie" (MaakTrainerversieButton.tsx
// op Articles.ts). Roept alleen de AI-herschrijving aan en geeft titel/tekst
// terug; de aanroeper slaat het resultaat zelf op als trainer-kennisversies-
// record via Payload's eigen REST-API (geen duplicaat schrijfpad hier) —
// zelfde opzet als /api/creator/variant-adapt. Krijgt server-side het
// brondocument zelf op (depth:1 voor category.title bij een artikel) i.p.v.
// door de aanroeper al meegegeven — de aanroeper is een kale admin-knop,
// geen workspace die de brontekst al in eigen state heeft.
//
// Kennisbasis-basiskennis (2026-08-23) — accepteert nu ÓÓK
// `knowledgeSourceId` (i.p.v. `articleId`), voor de "Maak trainerversie"-knop
// op /admin/kennisbasis (KennisbasisView.tsx): exact hetzelfde
// achtergronddocument dat de Helpdesk AI gebruikt (lib/assistant/
// kennisbasis-context.ts), nooit een los gekopieerde tekst. `isAchtergrondDocument`
// bewaakt dat dit uitsluitend voor een échte Kennisbasis-rij kan (bronrol
// "background-model") — niet voor een willekeurige andere knowledge-source
// (bv. een los geïmporteerde PDF), die hoort via het artikel-/Creator-pad te
// lopen, niet hierlangs.
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
    const body = (await request.json()) as { articleId?: number | string; knowledgeSourceId?: number | string };
    if (!body.articleId && !body.knowledgeSourceId) {
      return NextResponse.json({ error: "articleId of knowledgeSourceId is verplicht." }, { status: 400 });
    }

    if (body.knowledgeSourceId) {
      const bron = await payload.findByID({ collection: "knowledge-sources", id: body.knowledgeSourceId, depth: 0, overrideAccess: true }).catch(() => null);
      if (!bron) {
        return NextResponse.json({ error: "Kennisbasisdocument niet gevonden." }, { status: 404 });
      }
      if (!isAchtergrondDocument({ type: bron.type, purpose: bron.purpose })) {
        return NextResponse.json({ error: "Dit document is geen Kennisbasis-achtergronddocument." }, { status: 400 });
      }
      const brontekst = (bron.content ?? "").trim();
      if (!brontekst) {
        return NextResponse.json({ error: "De Kennisbasis heeft nog geen tekst om van te herschrijven." }, { status: 400 });
      }

      const resultaat = await genereerTrainerversieVanTekst(bron.title, brontekst, "Kennisbasis-document");
      return NextResponse.json({ ...resultaat, knowledgeSourceId: bron.id });
    }

    const artikel = await payload.findByID({ collection: "articles", id: body.articleId!, depth: 1, overrideAccess: true }).catch(() => null);
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
