import { describe, it, expect } from "vitest";
import { vergelijkTekst } from "./migreer-kennisbasis-naar-variant";

describe("vergelijkTekst", () => {
  it("meldt gelijk:true en geen afwijkingen voor identieke tekst", () => {
    const tekst = "## Kop\nRegel een.\nRegel twee.";

    const resultaat = vergelijkTekst(tekst, tekst);

    expect(resultaat.gelijk).toBe(true);
    expect(resultaat.afwijkingen).toEqual([]);
  });

  it("negeert triviale verschillen die normaliseerVoorVergelijking al wegneemt (bv. trailing whitespace)", () => {
    const resultaat = vergelijkTekst("Regel een.\nRegel twee.", "Regel een. \nRegel twee.\n");

    expect(resultaat.gelijk).toBe(true);
  });

  it("meldt een afwijking met regelnummer en beide varianten wanneer de tekst inhoudelijk verschilt", () => {
    const resultaat = vergelijkTekst("Kop A\nInhoud een.", "Kop A\nInhoud TWEE.");

    expect(resultaat.gelijk).toBe(false);
    expect(resultaat.afwijkingen).toHaveLength(1);
    expect(resultaat.afwijkingen[0]).toContain("Regel 2");
    expect(resultaat.afwijkingen[0]).toContain("Inhoud een.");
    expect(resultaat.afwijkingen[0]).toContain("Inhoud TWEE.");
  });

  it("meldt een afwijking wanneer de opgeslagen tekst korter is (ontbrekende regels)", () => {
    const resultaat = vergelijkTekst("Regel een.\nRegel twee.\nRegel drie.", "Regel een.\nRegel twee.");

    expect(resultaat.gelijk).toBe(false);
    expect(resultaat.afwijkingen[0]).toContain("(ontbreekt)");
  });
});
