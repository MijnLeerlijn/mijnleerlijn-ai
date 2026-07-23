import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { list, put, del } from "@vercel/blob";
import { requireEnv } from "@/config/env";
import { HANDLEIDINGEN_BLOB_PREFIX, blobPathnameVoor } from "@/lib/knowledge/manuals-blob";

// Eenmalig (en veilig herhaalbaar) importscript: uploadt ALLE bestanden uit
// website/handleidingen/ naar Vercel Blob (access: 'public' — product-
// documentatie, geen persoonsgegevens). Zie lib/knowledge/manuals-blob.ts
// voor het naamgevingsschema (sha256 in de Blob-bestandsnaam, zodat
// syncManuals() later zonder download kan bepalen wat nieuw/gewijzigd is)
// en app/api/knowledge/sync-manuals/route.ts voor de echte synchronisatie
// die op deze upload volgt.
//
// "Alle bestanden" (niet uitsluitend .pdf — zie de opdracht): syncManuals
// zelf filtert op .pdf bij het lezen uit Blob, dus niet-PDF-bestanden (bv.
// .docx/.mp4/.pptx die inmiddels ook in de map staan) worden gewoon mee
// geback-upt naar Blob, maar nooit als kennisbron verwerkt.
//
// Idempotent en veilig herhaalbaar: een bestand met exact dezelfde inhoud
// (zelfde sha256) wordt nooit opnieuw geüpload. Is de inhoud gewijzigd
// (zelfde pad, andere hash), dan wordt de nieuwe versie geüpload en wordt
// de oude Blob-versie daarna verwijderd — voorkomt dat elke wijziging een
// verouderde kopie achterlaat. Bestaande KnowledgeSources/Payload worden
// door dit script NOOIT aangeraakt — dat is uitsluitend het werk van
// syncManuals (de "Synchroniseer handleidingen"-knop erna).
//
// Streamt bestanden rechtstreeks van schijf (createReadStream, geen
// readFile) — bewust, want er zitten bestanden van honderden MB's tot
// >1 GB tussen; alles in het geheugen laden zou dit script laten crashen.
//
// Gebruik: npm run upload:handleidingen
//   (== node --env-file=.env node_modules/.bin/tsx payload/upload-manuals-to-blob/index.ts)
//
// Auth: UITSLUITEND BLOB_READ_WRITE_TOKEN, bewust NOOIT OIDC — anders dan
// services/storage.ts (dat blobAuthOptions() gebruikt: token indien
// aanwezig, anders Vercel OIDC als fallback, prima voor productiecode die
// op Vercel zelf draait). Reden: @vercel/blob 2.6.1 probeert, wanneer er
// geen `token`-optie wordt meegegeven, EERST Vercel OIDC — via het bundelde
// @vercel/oidc-package, die het lokale Vercel CLI-projectkoppelbestand
// (.vercel/project.json) rechtstreeks van schijf leest, VOORDAT
// BLOB_READ_WRITE_TOKEN uit de omgeving ook maar bekeken wordt (zie
// node_modules/@vercel/blob/dist/chunk-CIIQSN42.js: options.token → OIDC →
// pas dan BLOB_READ_WRITE_TOKEN). Op een lokaal, aan Vercel gekoppeld
// project (`vercel link`, hier al gebeurd) is er dus ALTIJD een OIDC-token
// beschikbaar, ongeacht of BLOB_READ_WRITE_TOKEN ook gezet is — en dat
// token faalt zodra OIDC voor de "development"-omgeving niet is ingeschakeld
// in het Vercel-project. De enige manier om dit te omzeilen is een
// EXPLICIETE `token`-optie meegeven (die heeft altijd voorrang, vóór OIDC
// wordt geprobeerd) — vandaar BLOB_TOKEN_OPTIE hieronder, met requireEnv
// (geen stille fallback: zonder BLOB_READ_WRITE_TOKEN stopt dit script
// direct met een duidelijke fout, in plaats van via OIDC te proberen).
const BLOB_TOKEN_OPTIE = { token: requireEnv("BLOB_READ_WRITE_TOKEN") };

const dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDLEIDINGEN_DIR = path.resolve(dirname, "..", "..", "handleidingen");

interface LokaalBestand {
  relativePath: string;
  absolutePath: string;
  filename: string;
}

async function verzamelBestanden(map: string, basisMap: string): Promise<LokaalBestand[]> {
  let entries;
  try {
    entries = await readdir(map, { withFileTypes: true });
  } catch {
    return [];
  }
  const resultaten: LokaalBestand[] = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const volledigPad = path.join(map, entry.name);
    if (entry.isDirectory()) {
      resultaten.push(...(await verzamelBestanden(volledigPad, basisMap)));
      continue;
    }
    if (!entry.isFile()) continue;
    resultaten.push({
      relativePath: path.relative(basisMap, volledigPad).split(path.sep).join("/"),
      absolutePath: volledigPad,
      filename: entry.name,
    });
  }
  return resultaten.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function hashBestand(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(absolutePath);
    stream.on("error", reject);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const MIME_PER_EXTENSIE: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function mimeType(filename: string): string {
  return MIME_PER_EXTENSIE[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const eenheden = ["KB", "MB", "GB", "TB"];
  let waarde = bytes / 1024;
  let i = 0;
  while (waarde >= 1024 && i < eenheden.length - 1) {
    waarde /= 1024;
    i += 1;
  }
  return `${waarde.toFixed(1)} ${eenheden[i]}`;
}

const BESTANDSNAAM_PATROON = /^([0-9a-f]{64})__(.+)$/i;

/** Bestaande Blob-versie(s) van het logische bestand op `logicalPath`, ongeacht hash. */
async function bestaandeBlobsVoorPad(logicalPath: string): Promise<{ pathname: string; hash: string }[]> {
  const segmenten = logicalPath.split("/");
  const bestandsnaam = segmenten.pop();
  const dirPrefix = segmenten.length > 0 ? `${segmenten.join("/")}/` : "";
  const { blobs } = await list({ prefix: dirPrefix, ...BLOB_TOKEN_OPTIE });

  const resultaten: { pathname: string; hash: string }[] = [];
  for (const blob of blobs) {
    const laatsteSegment = blob.pathname.split("/").pop() ?? "";
    const match = BESTANDSNAAM_PATROON.exec(laatsteSegment);
    if (!match || match[2] !== bestandsnaam) continue;
    resultaten.push({ pathname: blob.pathname, hash: match[1]!.toLowerCase() });
  }
  return resultaten;
}

async function run() {
  const bestanden = await verzamelBestanden(HANDLEIDINGEN_DIR, HANDLEIDINGEN_DIR);
  if (bestanden.length === 0) {
    console.error(`Geen bestanden gevonden in ${HANDLEIDINGEN_DIR} — niets te uploaden.`);
    process.exit(1);
  }

  console.log(
    `${bestanden.length} bestand(en) gevonden in ${HANDLEIDINGEN_DIR}. Start upload naar Vercel Blob…\n`
  );

  let nieuwGeupload = 0;
  let bijgewerkt = 0;
  let ongewijzigdOvergeslagen = 0;
  let mislukt = 0;
  let bytesGeupload = 0;

  for (const [index, bestand] of bestanden.entries()) {
    const logicalPath = `${HANDLEIDINGEN_BLOB_PREFIX}${bestand.relativePath}`;
    const voortgang = `[${index + 1}/${bestanden.length}]`;

    try {
      const info = await stat(bestand.absolutePath);
      const hash = await hashBestand(bestand.absolutePath);
      const bestaande = await bestaandeBlobsVoorPad(logicalPath);

      if (bestaande.some((b) => b.hash === hash)) {
        console.log(`${voortgang} ongewijzigd, overgeslagen: ${bestand.relativePath}`);
        ongewijzigdOvergeslagen += 1;
        continue;
      }

      const doelPathname = blobPathnameVoor(logicalPath, hash);
      console.log(`${voortgang} uploaden (${formatBytes(info.size)}): ${bestand.relativePath}`);

      await put(doelPathname, createReadStream(bestand.absolutePath), {
        access: "public",
        addRandomSuffix: false,
        contentType: mimeType(bestand.filename),
        multipart: true,
        ...BLOB_TOKEN_OPTIE,
      });

      const verouderd = bestaande.filter((b) => b.hash !== hash);
      if (verouderd.length > 0) {
        await del(
          verouderd.map((b) => b.pathname),
          { ...BLOB_TOKEN_OPTIE }
        );
        bijgewerkt += 1;
      } else {
        nieuwGeupload += 1;
      }
      bytesGeupload += info.size;
    } catch (error) {
      mislukt += 1;
      const boodschap = error instanceof Error ? error.message : String(error);
      console.error(`${voortgang} MISLUKT: ${bestand.relativePath} — ${boodschap}`);
    }
  }

  console.log(
    `\nKlaar. Nieuw geüpload: ${nieuwGeupload} · Bijgewerkt: ${bijgewerkt} · Ongewijzigd overgeslagen: ${ongewijzigdOvergeslagen} · Mislukt: ${mislukt} · Totaal geüpload: ${formatBytes(bytesGeupload)}`
  );
  process.exit(mislukt > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error("Upload mislukt:", error);
  process.exit(1);
});
