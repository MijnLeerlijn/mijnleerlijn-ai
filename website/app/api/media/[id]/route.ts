import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { resolveerBestandsUrl } from "@/lib/knowledge/process-source";

// Uniforme private-uploadarchitectuur (2026-07-31): de ENE, stabiele,
// publiek te gebruiken URL voor elk Media-document — variantlogo's,
// Handleidingbouwer-screenshots, downloadbare PDF's, alles. Het
// onderliggende `media.url`-veld is een echte, private Blob-URL (nooit
// rechtstreeks fetch()-baar); deze route is de enige plek die daarvoor een
// kortlevende signed URL opvraagt en doorstuurt.
//
// Hergebruikt bewust resolveerBestandsUrl() (lib/knowledge/process-
// source.ts) — dezelfde, al bestaande functie die de AI-indexering en de
// PDF-downloadroute (app/api/knowledge/download/[id]) al gebruiken: die
// herkent een private Blob-URL aan het vaste `*.private.blob.vercel-
// storage.com`-hostnamepatroon (isPrivateBlobUrl) en signt uitsluitend DIE
// exacte, uit het document zelf gelezen sleutel. Er wordt nergens een
// client-aangeleverde URL of pad geaccepteerd — de enige input is het
// numerieke Media-ID, gebruikt voor een gewone database-opzoeking. Een
// document met een al-absolute (of legacy-lokale) URL wordt gewoon als-is
// teruggegeven/doorverwezen; niets hiervan kan een willekeurige externe URL
// proxyen.
//
// Redirect i.p.v. streamen: de afbeeldingsbytes lopen zo nooit door de
// Next.js-server heen — de browser haalt ze rechtstreeks bij Vercel Blob op
// (met de daar al bij upload gezette, correcte Content-Type).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mediaId = Number(id);
  if (!Number.isInteger(mediaId)) {
    return NextResponse.json({ error: "Ongeldig media-ID." }, { status: 400 });
  }

  const payload = await getPayload({ config });

  const media = await payload
    .findByID({ collection: "media", id: mediaId, depth: 0, overrideAccess: false })
    .catch(() => null);
  if (!media) {
    return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  }

  const url = await resolveerBestandsUrl(payload, mediaId);
  if (!url) {
    return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  }

  // Nooit cachen: een signed URL is kortlevend en verschilt per aanroep —
  // de STABIELE /api/media/[id]-URL zelf mag daarom niet gecachet worden
  // als zou hij altijd naar dezelfde bestemming wijzen.
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
