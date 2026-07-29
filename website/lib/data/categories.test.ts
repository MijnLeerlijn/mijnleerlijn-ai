import { describe, it, expect } from "vitest";
import { categorieen, vindCategorie, type CategorieKleur } from "./categories";

const GELDIGE_KLEUREN: CategorieKleur[] = [
  "blue",
  "green",
  "red",
  "orange",
  "yellow",
  "purple",
  "teal",
  "pink",
  "slate",
];

// Categorie-uiterlijk (2026-07-29): `categorieen` is de seed-bron voor
// payload/seed/index.ts (`icon`/`color` per categorie) — deze test vangt een
// vergeten hernoeming op na de overstap van 5 Nederlandse naar 9 Engelse
// kleurwaarden (zie payload/migrations/20260729_150000_categorie_kleuren_uitbreiden.ts).
describe("categorieen (seed-data)", () => {
  it("heeft voor elke categorie een geldige CategorieKleur-waarde", () => {
    for (const categorie of categorieen) {
      expect(GELDIGE_KLEUREN).toContain(categorie.kleur);
    }
  });

  it("heeft voor elke categorie een niet-lege iconnaam", () => {
    for (const categorie of categorieen) {
      expect(categorie.icoon.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("vindCategorie", () => {
  it("vindt een bestaande categorie op slug", () => {
    expect(vindCategorie("starten")?.titel).toBe("Starten met MijnLeerlijn");
  });

  it("geeft undefined voor een onbekende slug", () => {
    expect(vindCategorie("bestaat-niet")).toBeUndefined();
  });
});
