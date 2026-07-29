import { describe, it, expect } from "vitest";
import { normaliseerIconNaam, iconWeergavenaam, iconNames, populaireIconen, STANDAARD_ICOON } from "./lucide-icon-lookup";

describe("normaliseerIconNaam", () => {
  it("laat een geldige kebab-case naam ongewijzigd", () => {
    expect(normaliseerIconNaam("rocket")).toBe("rocket");
  });

  it("zet een legacy PascalCase-naam om naar kebab-case", () => {
    expect(normaliseerIconNaam("StickyNote")).toBe("sticky-note");
    expect(normaliseerIconNaam("FileText")).toBe("file-text");
    expect(normaliseerIconNaam("Rocket")).toBe("rocket");
  });

  it("zet 'BarChart3' (bestaande categoriedata) om naar de geldige alias 'bar-chart-3'", () => {
    expect(normaliseerIconNaam("BarChart3")).toBe("bar-chart-3");
  });

  it("valt terug op het standaardicoon bij een onbekende naam", () => {
    expect(normaliseerIconNaam("DitBestaatEchtNiet")).toBe(STANDAARD_ICOON);
  });

  it("valt terug op het standaardicoon bij een lege of ontbrekende naam", () => {
    expect(normaliseerIconNaam("")).toBe(STANDAARD_ICOON);
    expect(normaliseerIconNaam("   ")).toBe(STANDAARD_ICOON);
    expect(normaliseerIconNaam(undefined)).toBe(STANDAARD_ICOON);
    expect(normaliseerIconNaam(null)).toBe(STANDAARD_ICOON);
  });
});

describe("iconWeergavenaam", () => {
  it("zet een kebab-naam om naar een leesbare naam", () => {
    expect(iconWeergavenaam("sticky-note")).toBe("Sticky Note");
    expect(iconWeergavenaam("rocket")).toBe("Rocket");
  });
});

describe("populaireIconen", () => {
  it("bevat uitsluitend geldige iconnamen uit de volledige bibliotheek", () => {
    const index = new Set(iconNames);
    for (const naam of populaireIconen) {
      expect(index.has(naam)).toBe(true);
    }
  });
});
