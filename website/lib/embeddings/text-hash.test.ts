import { describe, it, expect } from "vitest";
import { hashText } from "./text-hash";

describe("hashText", () => {
  it("geeft dezelfde hash voor identieke tekst", () => {
    expect(hashText("Hallo wereld")).toBe(hashText("Hallo wereld"));
  });

  it("geeft een andere hash bij een gewijzigde tekst", () => {
    expect(hashText("Hallo wereld")).not.toBe(hashText("Hallo wereld!"));
  });

  it("geeft een 64-tekens hexadecimale sha256-hash terug", () => {
    expect(hashText("test")).toMatch(/^[0-9a-f]{64}$/);
  });
});
