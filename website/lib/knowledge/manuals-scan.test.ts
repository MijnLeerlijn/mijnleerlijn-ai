import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanManualsDirectory, readManualFile, titleFromFilename, getManualsDirectory } from "./manuals-scan";

// Echte tijdelijke mappen (geen mocks) — dit test de daadwerkelijke
// bestandssysteem-recursie, inclusief de submap-scenario uit de opdracht.

let tempDir: string | undefined;
let oorspronkelijkeCwd = process.cwd();

afterEach(async () => {
  process.chdir(oorspronkelijkeCwd);
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function maakTestOmgeving(bestanden: Record<string, string>) {
  oorspronkelijkeCwd = process.cwd();
  tempDir = await mkdtemp(path.join(tmpdir(), "manuals-scan-test-"));
  const handleidingenDir = path.join(tempDir, "handleidingen");
  await mkdir(handleidingenDir, { recursive: true });
  for (const [relatiefPad, inhoud] of Object.entries(bestanden)) {
    const volledigPad = path.join(handleidingenDir, relatiefPad);
    await mkdir(path.dirname(volledigPad), { recursive: true });
    await writeFile(volledigPad, inhoud);
  }
  process.chdir(tempDir);
}

describe("getManualsDirectory", () => {
  it("resolvet altijd relatief aan process.cwd() — nooit een hardgecodeerd absoluut pad", async () => {
    expect(getManualsDirectory()).toBe(path.join(process.cwd(), "handleidingen"));

    // Bewijst dat er geen pad hardgecodeerd is: wissel cwd, en de functie
    // moet meebewegen (precies wat garandeert dat dit werkt op Vercel, waar
    // process.cwd() de projectroot is, niet een lokaal ontwikkelpad).
    await maakTestOmgeving({ "iets.pdf": "inhoud" });
    // macOS resolvet /var als symlink naar /private/var bij chdir — daarom
    // hier vergeleken met process.cwd() zelf (de bron van waarheid voor de
    // functie), niet met het ongeresolvede tempDir-pad van mkdtemp().
    expect(getManualsDirectory()).toBe(path.join(process.cwd(), "handleidingen"));
    expect(getManualsDirectory()).not.toBe(path.join(oorspronkelijkeCwd, "handleidingen"));
  });
});

describe("scanManualsDirectory", () => {
  it("vindt PDF's in de map zelf én in een submap (recursief)", async () => {
    await maakTestOmgeving({
      "Handleiding-A.pdf": "%PDF-A",
      "sub/Handleiding-B.pdf": "%PDF-B",
      "sub/dieper/Handleiding-C.pdf": "%PDF-C",
    });

    const bestanden = await scanManualsDirectory();

    expect(bestanden.map((b) => b.relativePath).sort()).toEqual([
      "handleidingen/Handleiding-A.pdf",
      "handleidingen/sub/Handleiding-B.pdf",
      "handleidingen/sub/dieper/Handleiding-C.pdf",
    ]);
  });

  it("negeert niet-PDF-bestanden", async () => {
    await maakTestOmgeving({ "Handleiding.pdf": "%PDF", "Notities.txt": "geen pdf", ".DS_Store": "" });

    const bestanden = await scanManualsDirectory();

    expect(bestanden.map((b) => b.filename)).toEqual(["Handleiding.pdf"]);
  });

  it("geeft een lege lijst terug wanneer de map niet bestaat, zonder te crashen", async () => {
    oorspronkelijkeCwd = process.cwd();
    tempDir = await mkdtemp(path.join(tmpdir(), "manuals-scan-test-leeg-"));
    process.chdir(tempDir);

    const bestanden = await scanManualsDirectory();

    expect(bestanden).toEqual([]);
  });
});

describe("readManualFile", () => {
  it("berekent een stabiele sha256-hash op basis van de bestandsinhoud", async () => {
    await maakTestOmgeving({ "A.pdf": "identieke inhoud", "B.pdf": "identieke inhoud", "C.pdf": "andere inhoud" });
    const bestanden = await scanManualsDirectory();

    const a = bestanden.find((b) => b.filename === "A.pdf")!;
    const b = bestanden.find((b) => b.filename === "B.pdf")!;
    const c = bestanden.find((b) => b.filename === "C.pdf")!;

    const [hashA, hashB, hashC] = await Promise.all([readManualFile(a), readManualFile(b), readManualFile(c)]);

    expect(hashA.hash).toBe(hashB.hash);
    expect(hashA.hash).not.toBe(hashC.hash);
    expect(hashA.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("scanManualsDirectory — echte repository (Sprint 6 §6: productie-beschikbaarheid)", () => {
  it("vindt echte PDF's in website/handleidingen/ vanuit de daadwerkelijke project-cwd, zonder chdir", async () => {
    // Geen maakTestOmgeving()/chdir hier — dit draait bewust tegen de
    // echte repository-map, om aan te tonen dat handleidingen/ zich waar
    // het hoort bevindt (binnen website/, dus binnen Vercel's Root
    // Directory) en niet toevallig alleen in een geïsoleerde testmap werkt.
    const bestanden = await scanManualsDirectory();

    expect(bestanden.length).toBeGreaterThan(0);
    expect(bestanden.every((b) => b.relativePath.startsWith("handleidingen/"))).toBe(true);
    expect(bestanden.every((b) => b.filename.toLowerCase().endsWith(".pdf"))).toBe(true);
  });
});

describe("titleFromFilename", () => {
  it("zet streepjes/underscores om naar spaties en verwijdert de extensie", () => {
    expect(titleFromFilename("Hoe-maak-je-een-hoofdprofiel-aan.pdf")).toBe("Hoe maak je een hoofdprofiel aan");
    expect(titleFromFilename("Admin_Statussets_1.PDF")).toBe("Admin Statussets 1");
  });
});
