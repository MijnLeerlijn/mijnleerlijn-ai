import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Multi-brand variants (2026-07-30): afgeleide statistieken per variant voor
// de Varianten-beheerpagina (aantal kennisbronnen, laatste indexatie,
// laatste AI-gesprek) — geen velden op Variants zelf, dus geen gewone
// Payload-REST-call. Zelfde "gecontroleerde, doelgerichte route"-patroon
// als app/api/download-categories/*.
export async function GET(request: NextRequest) {
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

  const varianten = await payload.find({ collection: "variants", limit: 200, depth: 0, overrideAccess: true });

  const resultaat: Record<
    number,
    { aantalKennisbronnen: number; laatsteIndexatie: string | null; laatsteGesprek: string | null }
  > = {};

  await Promise.all(
    varianten.docs.map(async (variant) => {
      const [aantal, laatsteBron, laatsteGesprek] = await Promise.all([
        payload.count({
          collection: "knowledge-sources",
          where: { variantContext: { equals: variant.id } },
          overrideAccess: true,
        }),
        payload.find({
          collection: "knowledge-sources",
          where: { variantContext: { equals: variant.id } },
          sort: "-embeddedAt",
          limit: 1,
          depth: 0,
          overrideAccess: true,
        }),
        payload.find({
          collection: "assistant-conversations",
          where: { variant: { equals: variant.id } },
          sort: "-createdAt",
          limit: 1,
          depth: 0,
          overrideAccess: true,
        }),
      ]);

      resultaat[variant.id] = {
        aantalKennisbronnen: aantal.totalDocs,
        laatsteIndexatie: (laatsteBron.docs[0] as { embeddedAt?: string | null } | undefined)?.embeddedAt ?? null,
        laatsteGesprek: (laatsteGesprek.docs[0] as { createdAt?: string } | undefined)?.createdAt ?? null,
      };
    })
  );

  return NextResponse.json(resultaat);
}
