import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { defaultVariant } from "@/config/variants";

// Multi-brand variants (2026-07-30): gecontroleerd verwijderen — nooit een
// stille cascade-verwijdering van gekoppelde content. Zelfde patroon als
// app/api/download-categories/delete/route.ts ("server-side gebruikscontrole
// zit in de route zelf"). Bij gekoppelde content: 409 met de exacte
// aantallen, de beheerpagina biedt dan "archiveren" als alternatief i.p.v.
// definitief verwijderen. De standaardvariant kan hier nooit weg, ongeacht
// gekoppelde content — anders kan de site zonder geldige default komen te
// zitten.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde beheerders mogen dit." }, { status: 403 });
  }

  // Admin gebruikersbeheer (2026-08-25) — permissiecheck naast de bestaande rolcheck.
  if (!heeftAdminPermissie(sessieControle.user, "algemeen.varianten")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  const { id } = await params;
  const variantId = Number(id);
  if (!Number.isInteger(variantId)) {
    return NextResponse.json({ error: "Ongeldig id." }, { status: 400 });
  }

  const variant = await payload.findByID({
    collection: "variants",
    id: variantId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  });
  if (!variant) {
    return NextResponse.json({ error: "Variant niet gevonden." }, { status: 404 });
  }
  if (variant.slug === defaultVariant.slug) {
    return NextResponse.json(
      { error: "De standaardvariant kan niet verwijderd worden." },
      { status: 400 }
    );
  }

  const [kennisbronnen, onderwerpen, vragen, gesprekken, overrides] = await Promise.all([
    payload.count({ collection: "knowledge-sources", where: { variantContext: { equals: variantId } }, overrideAccess: true }),
    payload.count({ collection: "kennisbasis-onderwerpen", where: { variantContext: { equals: variantId } }, overrideAccess: true }),
    payload.count({ collection: "helpdesk-vragen", where: { variantContext: { equals: variantId } }, overrideAccess: true }),
    payload.count({ collection: "assistant-conversations", where: { variant: { equals: variantId } }, overrideAccess: true }),
    payload.count({ collection: "variant-overrides", where: { variant: { equals: variantId } }, overrideAccess: true }),
  ]);

  const gekoppeld = {
    kennisbronnen: kennisbronnen.totalDocs,
    helpdeskOnderwerpen: onderwerpen.totalDocs,
    helpdeskVragen: vragen.totalDocs,
    gesprekken: gesprekken.totalDocs,
    overrides: overrides.totalDocs,
  };
  const totaalGekoppeld = Object.values(gekoppeld).reduce((som, n) => som + n, 0);

  if (totaalGekoppeld > 0) {
    return NextResponse.json(
      {
        error:
          "Deze variant heeft nog gekoppelde content en kan niet verwijderd worden. Archiveer de variant in plaats daarvan (zet 'm op niet-actief/gearchiveerd).",
        gekoppeld,
      },
      { status: 409 }
    );
  }

  await payload.delete({ collection: "variants", id: variantId, overrideAccess: true });
  return NextResponse.json({ ok: true });
}
