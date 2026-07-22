import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("zet spaties om naar streepjes en maakt alles kleine letters", () => {
    expect(slugify("Een doelenset aan een groep koppelen")).toBe("een-doelenset-aan-een-groep-koppelen");
  });

  it("verwijdert diakritische tekens", () => {
    expect(slugify("Doelenset koppelén")).toBe("doelenset-koppelen");
  });

  it("verwijdert leidende en volgende streepjes", () => {
    expect(slugify("  --Titel--  ")).toBe("titel");
  });

  it("behandelt lege input zonder te crashen", () => {
    expect(slugify("")).toBe("");
  });
});
