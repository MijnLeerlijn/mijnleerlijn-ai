import { describe, it, expect } from "vitest";
import { sorteerTrainingenAlfabetisch } from "./training-sortering";

describe("sorteerTrainingenAlfabetisch", () => {
  it("sorteert alfabetisch A-Z op naam", () => {
    const trainingen = [
      { naam: "Training", datum: null },
      { naam: "Bijeenkomst | dagdeel", datum: null },
      { naam: "Online spreekuur", datum: null },
      { naam: "Online beheerderstraining", datum: null },
    ];
    const resultaat = sorteerTrainingenAlfabetisch(trainingen);
    expect(resultaat.map((t) => t.naam)).toEqual([
      "Bijeenkomst | dagdeel",
      "Online beheerderstraining",
      "Online spreekuur",
      "Training",
    ]);
  });

  it("is hoofdletterongevoelig — hoofdletters verstoren de volgorde niet", () => {
    const trainingen = [
      { naam: "zebra", datum: null },
      { naam: "Appel", datum: null },
      { naam: "banaan", datum: null },
      { naam: "Zebra", datum: null },
    ];
    const resultaat = sorteerTrainingenAlfabetisch(trainingen);
    expect(resultaat.map((t) => t.naam)).toEqual(["Appel", "banaan", "zebra", "Zebra"]);
  });

  it("gebruikt datum als tweede sorteercriterium bij exact gelijke naam (incl. verschillend hoofdlettergebruik)", () => {
    const trainingen = [
      { naam: "Training", datum: "2026-09-15" },
      { naam: "training", datum: "2026-08-20" },
      { naam: "TRAINING", datum: "2026-09-01" },
    ];
    const resultaat = sorteerTrainingenAlfabetisch(trainingen);
    expect(resultaat.map((t) => t.datum)).toEqual(["2026-08-20", "2026-09-01", "2026-09-15"]);
  });

  it("trainingen zonder datum sorteren als eerste bij een naamgelijkspel", () => {
    const trainingen = [
      { naam: "Training", datum: "2026-09-01" },
      { naam: "Training", datum: null },
    ];
    const resultaat = sorteerTrainingenAlfabetisch(trainingen);
    expect(resultaat.map((t) => t.datum)).toEqual([null, "2026-09-01"]);
  });

  it("is een pure functie — de invoerarray wordt niet gemuteerd", () => {
    const trainingen = [
      { naam: "Zebra", datum: null },
      { naam: "Aap", datum: null },
    ];
    const kopie = [...trainingen];
    sorteerTrainingenAlfabetisch(trainingen);
    expect(trainingen).toEqual(kopie);
  });

  it("respecteert Nederlandse locale-sortering (bv. diakrieten)", () => {
    const trainingen = [
      { naam: "Zomertraining", datum: null },
      { naam: "Éénmalig spreekuur", datum: null },
      { naam: "Adviesgesprek", datum: null },
    ];
    const resultaat = sorteerTrainingenAlfabetisch(trainingen);
    expect(resultaat.map((t) => t.naam)).toEqual(["Adviesgesprek", "Éénmalig spreekuur", "Zomertraining"]);
  });
});
