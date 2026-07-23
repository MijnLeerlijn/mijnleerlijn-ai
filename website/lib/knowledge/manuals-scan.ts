import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Scant handleidingen/ (repository-relatief, zie het commentaar bij
// getManualsDirectory hieronder) recursief op PDF's, en berekent de
// sha256-hash van elk bestand — de kern van lib/knowledge/sync-manuals.ts'
// dedup-/wijzigingsdetectie. Puur, geen Payload-afhankelijkheid.
//
// BELANGRIJK (Sprint 6 §6 "Bestandsbeschikbaarheid in productie"): Vercel's
// Root Directory voor dit project is `website/` (bevestigd via
// `vercel project inspect`) — alleen wat zich BINNEN website/ bevindt wordt
// meegenomen in de build/deploy. De map handleidingen/ stond oorspronkelijk
// op de monorepo-root (naast website/, dus NIET meegenomen) en is daarom
// verplaatst naar website/handleidingen/ (git mv, geen kopie — één bron van
// waarheid, geen twee plekken om bij te houden). Vandaar dat het pad hier
// relatief aan process.cwd() is (de website/-map zelf tijdens zowel `next
// dev` als de gebouwde Vercel-functie), NOOIT een absoluut lokaal pad.

export function getManualsDirectory(): string {
  return path.join(process.cwd(), "handleidingen");
}

export interface ManualFile {
  /** Repository-relatief pad t.o.v. website/, bv. "handleidingen/Analyse.pdf". */
  relativePath: string;
  absolutePath: string;
  filename: string;
}

async function verzamelBestanden(map: string, basisMap: string): Promise<ManualFile[]> {
  let entries;
  try {
    entries = await readdir(map, { withFileTypes: true });
  } catch {
    return [];
  }

  const resultaten: ManualFile[] = [];
  for (const entry of entries) {
    const volledigPad = path.join(map, entry.name);
    if (entry.isDirectory()) {
      resultaten.push(...(await verzamelBestanden(volledigPad, basisMap)));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) continue;
    resultaten.push({
      relativePath: path.relative(basisMap, volledigPad).split(path.sep).join("/"),
      absolutePath: volledigPad,
      filename: entry.name,
    });
  }
  return resultaten;
}

/** Scant handleidingen/ recursief (inclusief submappen) op PDF's, alfabetisch op pad. */
export async function scanManualsDirectory(): Promise<ManualFile[]> {
  const websiteRoot = process.cwd();
  const manualsDir = getManualsDirectory();
  const bestanden = await verzamelBestanden(manualsDir, websiteRoot);
  return bestanden.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function readManualFile(bestand: ManualFile): Promise<{ buffer: Buffer; hash: string }> {
  const buffer = await readFile(bestand.absolutePath);
  const hash = createHash("sha256").update(buffer).digest("hex");
  return { buffer, hash };
}

export async function manualFileExists(bestand: ManualFile): Promise<boolean> {
  try {
    const info = await stat(bestand.absolutePath);
    return info.isFile();
  } catch {
    return false;
  }
}

/** Leidt een titel af uit de bestandsnaam — gebruikt wanneer geen betere titel beschikbaar is. */
export function titleFromFilename(filename: string): string {
  const zonderExtensie = filename.replace(/\.pdf$/i, "");
  return zonderExtensie
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
