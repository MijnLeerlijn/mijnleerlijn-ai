import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Vervolgronde (2026-08-22) — statische architectuurgrens voor de trainer-
// Kennis-Q&A (opdrachtseis: "Trainerkennis krijgt een eigen route/
// retrievalflow" — expliciet nooit schoolcontext, trainingsverslagen,
// logboekitems, telefoongesprekken, persoonsgegevens of Monday-CRM-data).
// Scant uitsluitend de daadwerkelijke import-statements, niet de volledige
// bestandstekst: de toelichtende doc-comments in deze bestanden noemen de
// verboden modulenamen zelf juist wél (uitleg waaróm ze niet geïmporteerd
// worden) — een kale substring-scan over de hele tekst zou daar dus valse
// positieven op geven. Zelfde bewezen aanpak als
// lib/trainers/telefonie/architecture.test.ts (broncodetekst-scan i.p.v.
// uitsluitend gedragsdekking), hier toegespitst op import-specifiers.

const PROJECT_ROOT = join(__dirname, "..", "..");
const GESCANDE_BESTANDEN = [
  join(PROJECT_ROOT, "lib/trainers/kennis.ts"),
  join(PROJECT_ROOT, "lib/trainers/kennis-antwoord.ts"),
  join(PROJECT_ROOT, "app/api/trainers/kennis/vraag/route.ts"),
];

// Zowel relatieve als @/-alias-vormen — dezelfde module kan op elke plek in
// de scan met een van beide geschreven zijn.
const VERBODEN_MODULES = [
  "./monday-links",
  "./verslag",
  "./logboek",
  "./telefonie",
  "@/lib/trainers/monday-links",
  "@/lib/trainers/verslag",
  "@/lib/trainers/logboek",
  "@/lib/trainers/telefonie",
];

function geimporteerdeModules(bron: string): string[] {
  const regex = /from\s+["']([^"']+)["']/g;
  const modules: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(bron)) !== null) {
    modules.push(match[1]!);
  }
  return modules;
}

describe("Architectuurgrens trainer-Kennis-Q&A — geen school-/verslag-/logboek-/telefoniecontext", () => {
  it("de scan vindt daadwerkelijk de drie te bewaken bestanden (sanity check)", () => {
    for (const pad of GESCANDE_BESTANDEN) {
      expect(() => readFileSync(pad, "utf-8"), `${pad} bestaat niet`).not.toThrow();
    }
  });

  it.each(GESCANDE_BESTANDEN.map((pad) => [pad.replace(`${PROJECT_ROOT}/`, ""), pad] as const))(
    "%s importeert nooit monday-links/verslag/logboek/telefonie",
    (_naam, pad) => {
      const modules = geimporteerdeModules(readFileSync(pad, "utf-8"));
      for (const verboden of VERBODEN_MODULES) {
        expect(modules, `${pad} importeert het verboden pad "${verboden}"`).not.toContain(verboden);
      }
    }
  );

  // Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing":
  // @/lib/content/markdown-headings toegevoegd aan de allowlist. Bewust
  // toegestaan: een zuivere, framework-loze Markdown-tekstparser (geen
  // Payload/database-aanroepen, geen school-/verslag-/logboek-/
  // telefoniecontext) — precies de categorie die deze grens NOOIT bedoelde
  // te blokkeren (zie de toelichting bovenaan dit bestand).
  it("importeert wél uitsluitend de eigen, toegestane trainer-kennis-modules + generieke AI-/Payload-infrastructuur", () => {
    const bron = readFileSync(join(PROJECT_ROOT, "lib/trainers/kennis.ts"), "utf-8");
    const modules = geimporteerdeModules(bron);
    for (const importPad of modules) {
      const toegestaan =
        importPad === "payload" ||
        importPad === "ai" ||
        importPad.startsWith("@/services/") ||
        importPad === "./kennis-antwoord" ||
        importPad === "@/lib/content/markdown-headings";
      expect(toegestaan, `lib/trainers/kennis.ts importeert een onverwachte module: "${importPad}"`).toBe(true);
    }
  });
});
