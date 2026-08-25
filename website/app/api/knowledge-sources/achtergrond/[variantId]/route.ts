import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { vindAchtergrondDocumentenVoorVariant } from "@/lib/assistant/kennisbasis-context";
import { maakAchtergrondKennisbron } from "@/payload/collections/Variants";

// Kennisbasis per variant (2026-07-31): het centrale Kennisbasis-scherm
// (payload/components/KennisbasisView.tsx) leest en schrijft UITSLUITEND via
// deze route — nooit rechtstreeks Payload's generieke
// /api/knowledge-sources-REST-endpoint. Reden: het "precies één
// achtergronddocument per variant"-principe moet hier worden afgedwongen
// (zoeken op kenmerk, nooit op id/titel; aanmaken via exact dezelfde
// conventie als de automatische hook), en een generieke lijst-/filter-
// aanroep vanuit de client zou die garantie niet bieden.
async function vereisAdmin(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) return { payload, ok: false as const };
  if (!heeftAdminPermissie(sessieControle.user, "helpdesk-ai.kennisbronnen")) return { payload, ok: false as const };
  return { payload, ok: true as const };
}

async function haalVariantOp(payload: Awaited<ReturnType<typeof getPayload>>, variantId: number) {
  return payload.findByID({
    collection: "variants",
    id: variantId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ variantId: string }> }) {
  const { payload, ok } = await vereisAdmin(request);
  if (!ok) return NextResponse.json({ error: "Alleen ingelogde beheerders mogen dit." }, { status: 403 });

  const variantId = Number((await params).variantId);
  if (!Number.isInteger(variantId)) {
    return NextResponse.json({ error: "Ongeldig variant-id." }, { status: 400 });
  }

  const variant = await haalVariantOp(payload, variantId);
  if (!variant) return NextResponse.json({ error: "Variant niet gevonden." }, { status: 404 });

  const kandidaten = await vindAchtergrondDocumentenVoorVariant(payload, variantId);
  if (kandidaten.length > 1) {
    payload.logger.warn(
      `[achtergrond-route] Variant ${variantId} heeft ${kandidaten.length} achtergronddocumenten — dit zou nooit mogen door de uniekheidsvalidatie. Toont de meest recent bijgewerkte.`
    );
  }
  const [document] = [...kandidaten].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  return NextResponse.json({
    variant: {
      id: variant.id,
      name: (variant as unknown as { name?: string }).name ?? "",
      productNaam:
        (variant as unknown as { branding?: { productName?: string } }).branding?.productName ??
        (variant as unknown as { name?: string }).name ??
        "",
      actief: Boolean((variant as unknown as { actief?: boolean }).actief),
      status: (variant as unknown as { status?: string }).status ?? null,
    },
    document: document
      ? {
          id: document.id,
          title: document.title ?? "",
          content: document.content ?? "",
          updatedAt: document.updatedAt ?? null,
        }
      : null,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ variantId: string }> }) {
  const { payload, ok } = await vereisAdmin(request);
  if (!ok) return NextResponse.json({ error: "Alleen ingelogde beheerders mogen dit." }, { status: 403 });

  const variantId = Number((await params).variantId);
  if (!Number.isInteger(variantId)) {
    return NextResponse.json({ error: "Ongeldig variant-id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  if (!body || typeof body.content !== "string") {
    return NextResponse.json({ error: "Veld 'content' (tekst) is verplicht." }, { status: 400 });
  }

  const variant = await haalVariantOp(payload, variantId);
  if (!variant) return NextResponse.json({ error: "Variant niet gevonden." }, { status: 404 });

  const kandidaten = await vindAchtergrondDocumentenVoorVariant(payload, variantId);
  if (kandidaten.length > 1) {
    return NextResponse.json(
      { error: `Variant heeft ${kandidaten.length} achtergronddocumenten (zou uniek moeten zijn) — controleer knowledge-sources handmatig vóór het opslaan.` },
      { status: 409 }
    );
  }

  let knowledgeSourceId: number;
  if (kandidaten[0]) {
    knowledgeSourceId = kandidaten[0].id;
    await payload.update({
      collection: "knowledge-sources",
      id: knowledgeSourceId,
      overrideAccess: true,
      data: { content: body.content },
    });
  } else {
    const productNaam =
      (variant as unknown as { branding?: { productName?: string } }).branding?.productName ??
      (variant as unknown as { name?: string }).name ??
      "Variant";
    knowledgeSourceId = await maakAchtergrondKennisbron(payload, {
      variantId,
      productNaam,
      content: body.content,
    });
  }

  return NextResponse.json({ ok: true, knowledgeSourceId });
}
