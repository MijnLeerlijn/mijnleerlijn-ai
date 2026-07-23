import { list } from "@vercel/blob";
import { blobAuthOptions } from "@/services/storage";

// Vervangt lib/knowledge/manuals-scan.ts (Vercel's Root Directory bevat wel
// website/, maar `website/handleidingen/` bleek via .vercelignore alsnog
// buiten de deploy te vallen — en met de map inmiddels op 1,6 GB is
// "gewoon meebundelen in de serverless functie" sowieso geen houdbare
// aanpak, los van .vercelignore). Handleidingen staan nu in Vercel Blob
// (access: 'public' — productdocumentatie, geen persoonsgegevens; zie
// services/storage.ts voor de private tegenhanger met bijlagen).
//
// SHA256-detectie ZONDER download: de hash wordt eenmalig, lokaal berekend
// door het importscript (payload/upload-manuals-to-blob/index.ts) en in de
// Blob-bestandsnaam zelf gecodeerd (zie blobPathnameVoor hieronder). Zo kan
// syncManuals() met één (gepagineerde) list()-aanroep voor ALLE bestanden
// bepalen of iets nieuw/gewijzigd/ongewijzigd is, zonder ook maar één byte
// te downloaden — cruciaal nu er bestanden van honderden MB's tot >1 GB
// tussen kunnen zitten. Er wordt uitsluitend gedownload (readManualBlob)
// voor bestanden die daadwerkelijk (her)geïndexeerd gaan worden.

export const HANDLEIDINGEN_BLOB_PREFIX = "handleidingen/";

const BESTANDSNAAM_PATROON = /^([0-9a-f]{64})__(.+)$/i;

export interface ManualBlob {
  /** Logisch pad, bv. "handleidingen/sub/Analyse.pdf" — zonder hash-segment, dit is wat in sourceFilePath wordt opgeslagen. */
  relativePath: string;
  /** sha256 (hex) van de bestandsinhoud, rechtstreeks uit de Blob-bestandsnaam gehaald — geen download nodig. */
  hash: string;
  /** De werkelijke sleutel/pathname in de Blob store. */
  blobPathname: string;
  url: string;
  size: number;
}

/** Bouwt de Blob-pathname voor een logisch pad + hash — de tegenhanger van parseBlobPathname. */
export function blobPathnameVoor(relativePath: string, hash: string): string {
  const segmenten = relativePath.split("/");
  const bestandsnaam = segmenten.pop();
  if (!bestandsnaam) throw new Error(`Ongeldig relatief pad: "${relativePath}"`);
  return [...segmenten, `${hash.toLowerCase()}__${bestandsnaam}`].join("/");
}

function parseBlobPathname(pathname: string): { relativePath: string; hash: string } | null {
  const segmenten = pathname.split("/");
  const laatste = segmenten[segmenten.length - 1];
  const match = laatste ? BESTANDSNAAM_PATROON.exec(laatste) : null;
  if (!match) return null;
  const [, hash, bestandsnaam] = match;
  if (!hash || !bestandsnaam) return null;
  return { relativePath: [...segmenten.slice(0, -1), bestandsnaam].join("/"), hash: hash.toLowerCase() };
}

/**
 * Lijst alle handleiding-PDF's in Blob op (gepagineerd, alle paginas
 * doorlopen). Alleen bestandsnamen met het verwachte `<sha256>__naam.pdf`-
 * patroon worden meegenomen — bestanden die buiten het importscript om in
 * dezelfde map terechtkomen, worden genegeerd i.p.v. een crash te geven.
 */
export async function listManualBlobs(): Promise<ManualBlob[]> {
  const resultaten: ManualBlob[] = [];
  let cursor: string | undefined;

  do {
    const pagina = await list({
      prefix: HANDLEIDINGEN_BLOB_PREFIX,
      cursor,
      limit: 1000,
      ...blobAuthOptions(),
    });

    for (const blob of pagina.blobs) {
      if (!blob.pathname.toLowerCase().endsWith(".pdf")) continue;
      const geparsed = parseBlobPathname(blob.pathname);
      if (!geparsed) continue;
      resultaten.push({
        relativePath: geparsed.relativePath,
        hash: geparsed.hash,
        blobPathname: blob.pathname,
        url: blob.url,
        size: blob.size,
      });
    }

    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);

  return resultaten.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/** Downloadt de daadwerkelijke bestandsinhoud — alleen aanroepen voor bestanden die echt (her)verwerkt gaan worden. */
export async function readManualBlob(blob: ManualBlob): Promise<Buffer> {
  const response = await fetch(blob.url);
  if (!response.ok) {
    throw new Error(
      `Kon handleiding niet downloaden uit Blob (HTTP ${response.status}): ${blob.relativePath}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Leidt een titel af uit de bestandsnaam — gebruikt wanneer geen betere titel beschikbaar is. */
export function titleFromFilename(filename: string): string {
  const zonderExtensie = filename.replace(/\.pdf$/i, "");
  return zonderExtensie.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}
