import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { uploadDownloadBestand, verwijderBijlage } from "@/services/storage";
import { privateBlobPathname } from "@/lib/knowledge/process-source";
import type { Payload } from "payload";

// Downloadbeheer — PDF direct uploaden/vervangen (2026-07-28, herzien
// 2026-07-29): een beheerder kon voorheen een PDF alleen koppelen door eerst
// naar de Media-collectie te gaan en daar te uploaden — dit is de
// gecontroleerde route die Downloadbeheer direct laat uploaden, zonder die
// omweg.
//
// Bewust GEEN gebruik van Payload's `file`-optie op `payload.create()` meer
// (de oorspronkelijke versie deed dat wel): dat triggert de gedeelde
// vercelBlobStorage-plugin (payload.config.ts), die uitsluitend 'public'-
// toegang ondersteunt (hardcoded in de plugin, zie node_modules/
// @payloadcms/storage-vercel-blob/dist/index.js: `access: 'public'`). De
// productie-Blob-store (mijnleerlijn-media) is echter een PRIVATE store —
// live geverifieerd op 2026-07-29: elke upload via de plugin faalt daar met
// "Vercel Blob: Cannot use public access on a private store", ook via de
// normale Media-admin-UI (dus geen bug specifiek aan deze route, een
// plugin-brede beperking). De Blob-store blijft bewust private (opdracht:
// "Maak mijnleerlijn-media niet publiek").
//
// In plaats daarvan: exact hetzelfde patroon als lib/knowledge/
// sync-manuals.ts al gebruikt voor handleidingen — rechtstreeks uploaden via
// @vercel/blob (services/storage.ts, `access: 'private'`, dezelfde
// BLOB_READ_WRITE_TOKEN), en het resultaat handmatig op een Media-document
// zetten (`filesRequiredOnCreate: false` in Media.ts bestaat al precies
// hiervoor). Het bestaande resolveerBestandsUrl() (lib/knowledge/
// process-source.ts) herkent zo'n private Blob-URL automatisch aan het
// hostnamepatroon en genereert er pas bij een daadwerkelijke download een
// kortlevende signed URL voor (app/api/knowledge/download/[id]/route.ts) —
// die twee bestanden zijn dus NIET aangepast, ze werken al correct met dit
// opslagpatroon.
//
// Volgorde + rollback (verplicht: nooit een weesrecord of verweesde blob):
//   1. Nieuw bestand uploaden (private Blob).
//      - Mislukt dit → niets aangemaakt, direct 500, klaar.
//   2. Nieuw media-document aanmaken dat naar die Blob wijst.
//      - Mislukt dit → de zojuist geüploade Blob weer verwijderen, dan 500.
//   3. Koppelen: nieuwe knowledge-source aanmaken (create-flow) of het
//      bestaande item se `file`-veld bijwerken (replace-flow).
//      - Mislukt dit → het nieuwe media-document ÉN de nieuwe Blob weer
//        verwijderen, dan 500. Het OUDE bestand (bij vervangen) is op dit
//        punt nog volledig intact — nooit aangeraakt vóór succesvol koppelen.
//   4. (Alleen replace-flow) Nu pas het OUDE media-document en de oude Blob
//      verwijderen — non-fataal bij falen (best effort): de vervanging is
//      op dit punt al geslaagd en zichtbaar, een opruimfout mag dat niet
//      alsnog als mislukking rapporteren.
//
// "Geen dubbele bestanden bij vervangen" volgt automatisch uit stap 3+4: er
// is nooit een moment waarop het downloaditem geen werkend bestand heeft, en
// het oude bestand verdwijnt pas nadat het nieuwe al gegarandeerd werkt.
//
// Bestaande downloadfunctionaliteit blijft ongewijzigd werken: deze route
// wijzigt uitsluitend `knowledge-sources.file` (dezelfde relatie die
// app/api/knowledge/download/[id]/route.ts al gebruikt) en raakt nooit een
// bestaand media-document/bestaande Blob-URL vóór een geslaagde vervanging.

const MAX_BESTANDSGROOTTE = 25 * 1024 * 1024; // 25MB — ruim boven de grootste bestaande handleiding-PDF's.

async function ruimVerweesdeBlobOp(storageKey: string, reden: string) {
  await verwijderBijlage(storageKey).catch((error) => {
    console.error(`[api/knowledge-sources/upload-file] Opruimen verweesde blob (${reden}) mislukt:`, error);
  });
}

/** Best effort: het OUDE bestand van een geslaagde vervanging opruimen — een fout hier mag de al geslaagde vervanging nooit alsnog als mislukking rapporteren. */
async function ruimOudBestandOp(payload: Payload, oudeMediaId: number | string) {
  const oudeMedia = await payload
    .findByID({ collection: "media", id: oudeMediaId, overrideAccess: true, depth: 0 })
    .catch(() => null);

  await payload.delete({ collection: "media", id: oudeMediaId, overrideAccess: true }).catch((error) => {
    console.error("[api/knowledge-sources/upload-file] Opruimen oud media-document mislukt:", error);
  });

  if (oudeMedia?.url) {
    try {
      await verwijderBijlage(privateBlobPathname(oudeMedia.url));
    } catch (error) {
      console.error("[api/knowledge-sources/upload-file] Opruimen oude blob mislukt:", error);
    }
  }
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "helpdesk-ai.kennisbronnen")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
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

      const geupload = await uploadDownloadBestand(bestand);

      let nieuweMedia;
      try {
        nieuweMedia = await payload.create({
          collection: "media",
          overrideAccess: true,
          data: {
            altText: `Downloadbestand: ${bestaand.title}`,
            mediaType: "download",
            filename: geupload.filename,
            mimeType: geupload.mimeType,
            filesize: geupload.sizeBytes,
            url: geupload.url,
            // Verplicht: zonder focalX/focalY denkt Payload's eigen
            // generateFileData (shouldReupload()) dat het focuspunt is
            // gewijzigd t.o.v. een (niet-bestaand) vorig focuspunt, en
            // probeert het de URL zelf ongeauthenticeerd te fetchen om het
            // bestand "opnieuw te uploaden" — faalt op een private Blob-URL
            // ("Failed to fetch file from ..."), live geverifieerd op
            // 2026-07-29. sync-manuals.ts's maakMediaDoc() zet deze zelfde
            // twee velden om precies deze reden.
            focalX: 50,
            focalY: 50,
          },
        });
      } catch (error) {
        await ruimVerweesdeBlobOp(geupload.storageKey, "media-document aanmaken mislukt");
        throw error;
      }

      try {
        await payload.update({
          collection: "knowledge-sources",
          id: knowledgeSourceId,
          overrideAccess: true,
          data: { file: nieuweMedia.id },
        });
      } catch (error) {
        await payload.delete({ collection: "media", id: nieuweMedia.id, overrideAccess: true }).catch(() => {});
        await ruimVerweesdeBlobOp(geupload.storageKey, "koppelen aan downloaditem mislukt");
        throw error;
      }

      // Pas NU, na een bevestigd geslaagde koppeling, het oude bestand opruimen.
      if (oudeMediaId) {
        await ruimOudBestandOp(payload, oudeMediaId);
      }

      return NextResponse.json({ ok: true, id: knowledgeSourceId, mediaId: nieuweMedia.id });
    }

    // Nieuw downloaditem: titel + eerste upload in één stap.
    const titel = typeof titelRaw === "string" ? titelRaw.trim() : "";
    if (!titel) {
      return NextResponse.json({ error: "Titel is verplicht bij een nieuw downloaditem." }, { status: 400 });
    }

    const geupload = await uploadDownloadBestand(bestand);

    let nieuweMedia;
    try {
      nieuweMedia = await payload.create({
        collection: "media",
        overrideAccess: true,
        data: {
          altText: `Downloadbestand: ${titel}`,
          mediaType: "download",
          filename: geupload.filename,
          mimeType: geupload.mimeType,
          filesize: geupload.sizeBytes,
          url: geupload.url,
          focalX: 50,
          focalY: 50,
        },
      });
    } catch (error) {
      await ruimVerweesdeBlobOp(geupload.storageKey, "media-document aanmaken mislukt");
      throw error;
    }

    // zichtbaar bewust false: de nieuwe rij verschijnt direct in
    // Downloadbeheer, waar de beheerder categorie/volgorde/zichtbaarheid
    // zelf instelt en expliciet bevestigt vóórdat het item publiek wordt.
    let nieuweBron;
    try {
      nieuweBron = await payload.create({
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
    } catch (error) {
      await payload.delete({ collection: "media", id: nieuweMedia.id, overrideAccess: true }).catch(() => {});
      await ruimVerweesdeBlobOp(geupload.storageKey, "knowledge-source aanmaken mislukt");
      throw error;
    }

    return NextResponse.json({ ok: true, id: nieuweBron.id, mediaId: nieuweMedia.id });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/knowledge-sources/upload-file] Uploaden mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
