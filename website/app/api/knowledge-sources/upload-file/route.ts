import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Downloadbeheer — PDF direct uploaden/vervangen (2026-07-28): tot nu toe
// kon een beheerder een PDF alleen koppelen door eerst naar de Media-
// collectie te gaan en daar te uploaden — dit is de gecontroleerde route
// die Downloadbeheer direct laat uploaden, zonder die omweg. Hergebruikt
// bewust Payload's EIGEN upload-mechanisme (payload.create met een
// `file`-optie op de `media`-collectie) — dat triggert dezelfde
// vercelBlobStorage-plugin (payload.config.ts) die ook normale admin-
// uploads gebruikt, dus geen eigen Blob-code hier.
//
// "Geen dubbele bestanden bij vervangen": we maken eerst het NIEUWE
// media-document aan en koppelen dat aan de knowledge-source, en
// verwijderen PAS DAARNA het oude media-document — nooit andersom, zodat
// er nooit een moment is waarop de download niets heeft. Het verwijderen
// van een media-document triggert zelf weer de plugin's eigen
// `handleDelete`-hook, die de onderliggende Blob ook daadwerkelijk
// verwijdert (zie node_modules/@payloadcms/storage-vercel-blob/dist/
// adapter.js) — er hoeft dus geen aparte Blob-delete-aanroep in deze route.
//
// Bestaande downloadfunctionaliteit blijft ongewijzigd werken: deze route
// wijzigt uitsluitend `knowledge-sources.file` (dezelfde relatie die
// app/api/knowledge/download/[id]/route.ts al gebruikt) — de download-URL
// zelf (/api/knowledge/download/:id) en de resolutielogica
// (lib/knowledge/process-source.ts) blijven volledig ongemoeid.

const MAX_BESTANDSGROOTTE = 25 * 1024 * 1024; // 25MB — ruim boven de grootste bestaande handleiding-PDF's.

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  // Bewust GEEN `instanceof File`: in de testomgeving (jsdom) is `File`
  // een andere klasse dan de File-implementatie die NextRequest.formData()
  // zelf intern gebruikt — cross-realm instanceof faalt dan altijd, ook al
  // is het object functioneel identiek. Duck-typing (arrayBuffer/type/name)
  // werkt in beide gevallen én in productie.
  const bestandRaw = formData.get("file");
  const isBestand =
    bestandRaw !== null &&
    typeof bestandRaw === "object" &&
    typeof (bestandRaw as Blob).arrayBuffer === "function" &&
    typeof (bestandRaw as File).name === "string";
  if (!isBestand) {
    return NextResponse.json({ error: "Geen bestand meegestuurd." }, { status: 400 });
  }
  const bestand = bestandRaw as File;
  if (bestand.type !== "application/pdf") {
    return NextResponse.json({ error: "Alleen PDF-bestanden zijn toegestaan." }, { status: 400 });
  }
  if (bestand.size > MAX_BESTANDSGROOTTE) {
    return NextResponse.json({ error: "Bestand is te groot (max. 25MB)." }, { status: 400 });
  }

  const knowledgeSourceIdRaw = formData.get("knowledgeSourceId");
  const titelRaw = formData.get("title");

  const buffer = Buffer.from(await bestand.arrayBuffer());
  const fileData = { data: buffer, mimetype: bestand.type, name: bestand.name, size: bestand.size };

  try {
    if (typeof knowledgeSourceIdRaw === "string" && knowledgeSourceIdRaw.trim()) {
      // Vervangen van het bestand bij een bestaand downloaditem.
      const knowledgeSourceId = Number(knowledgeSourceIdRaw);
      if (!Number.isInteger(knowledgeSourceId)) {
        return NextResponse.json({ error: "Ongeldig knowledgeSourceId." }, { status: 400 });
      }

      const bestaand = await payload
        .findByID({ collection: "knowledge-sources", id: knowledgeSourceId, overrideAccess: true, depth: 0 })
        .catch(() => null);
      if (!bestaand) {
        return NextResponse.json({ error: "Downloaditem niet gevonden." }, { status: 404 });
      }
      const oudeMediaId = typeof bestaand.file === "object" ? bestaand.file?.id : bestaand.file;

      const nieuweMedia = await payload.create({
        collection: "media",
        overrideAccess: true,
        file: fileData,
        data: { altText: `Downloadbestand: ${bestaand.title}`, mediaType: "download" },
      });

      await payload.update({
        collection: "knowledge-sources",
        id: knowledgeSourceId,
        overrideAccess: true,
        data: { file: nieuweMedia.id },
      });

      if (oudeMediaId) {
        await payload.delete({ collection: "media", id: oudeMediaId, overrideAccess: true }).catch((error) => {
          // Non-fataal: het nieuwe bestand is al gekoppeld en werkt — het
          // opruimen van het oude bestand mag de gebruiker nooit alsnog een
          // foutmelding opleveren over iets dat al geslaagd is.
          console.error("[api/knowledge-sources/upload-file] Opruimen oud bestand mislukt:", error);
        });
      }

      return NextResponse.json({ ok: true, id: knowledgeSourceId, mediaId: nieuweMedia.id });
    }

    // Nieuw downloaditem: titel + eerste upload in één stap.
    const titel = typeof titelRaw === "string" ? titelRaw.trim() : "";
    if (!titel) {
      return NextResponse.json({ error: "Titel is verplicht bij een nieuw downloaditem." }, { status: 400 });
    }

    const nieuweMedia = await payload.create({
      collection: "media",
      overrideAccess: true,
      file: fileData,
      data: { altText: `Downloadbestand: ${titel}`, mediaType: "download" },
    });

    // zichtbaar bewust false: de nieuwe rij verschijnt direct in
    // Downloadbeheer, waar de beheerder categorie/volgorde/zichtbaarheid
    // zelf instelt en expliciet bevestigt vóórdat het item publiek wordt.
    const nieuweBron = await payload.create({
      collection: "knowledge-sources",
      overrideAccess: true,
      data: {
        title: titel,
        type: "pdf",
        priority: "core",
        file: nieuweMedia.id,
        zichtbaar: false,
        status: "new",
        embeddingStatus: "pending",
      },
    });

    return NextResponse.json({ ok: true, id: nieuweBron.id, mediaId: nieuweMedia.id });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/knowledge-sources/upload-file] Uploaden mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
