import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { resolveerBestandsUrl } from "@/lib/knowledge/process-source";

// Publieke (geen login) download-/openen-koppeling voor een zichtbare
// handleiding — Helpdesk MVP 1.0. Genereert de signed Blob-URL PAS op het
// moment van klikken (dezelfde "kortlevende signed URL, pas genereren bij
// daadwerkelijk gebruik"-aanpak als services/storage.ts, 5 minuten geldig) —
// zo'n URL mag dus nooit rechtstreeks in een JSON-respons van de chat-/
// sidebar-API belanden (die kan te lang blijven staan voordat iemand klikt).
// "Openen" en "Download PDF" in de UI verwijzen naar exact dezelfde link;
// het verschil zit uitsluitend in het `download`-attribuut van de <a>-tag.
//
// Herbevestigt `zichtbaar` HIER, opnieuw, server-side (verdediging in de
// diepte): zelfs als een client een verouderde/gecachete id zou hebben van
// een bron die een beheerder inmiddels heeft verborgen, wordt die nooit
// alsnog uitgeserveerd.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Ongeldig bron-id." }, { status: 400 });
  }

  const payload = await getPayload({ config });

  const bron = await payload
    .findByID({ collection: "knowledge-sources", id, overrideAccess: true, depth: 0 })
    .catch(() => null);

  if (!bron || !bron.zichtbaar || !bron.file) {
    return NextResponse.json({ error: "Deze handleiding is niet (meer) beschikbaar." }, { status: 404 });
  }

  const mediaId = typeof bron.file === "object" ? bron.file.id : bron.file;
  const url = await resolveerBestandsUrl(payload, mediaId).catch(() => null);
  if (!url) {
    return NextResponse.json({ error: "Kon dit bestand nu niet ophalen." }, { status: 502 });
  }

  return NextResponse.redirect(url);
}
