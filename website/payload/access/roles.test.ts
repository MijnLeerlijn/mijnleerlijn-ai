import { describe, it, expect } from "vitest";
import { isAdmin, isCentralEditor, isEditor, isVariantEditorFor, type AuthUser } from "./roles";

const admin: AuthUser = { id: 1, role: "admin" };
const centraleRedacteur: AuthUser = { id: 2, role: "editor" };
const variantRedacteurMonti: AuthUser = { id: 3, role: "editor", variantScope: 101 };
const variantRedacteurMontiRef: AuthUser = {
  id: 4,
  role: "editor",
  variantScope: { id: 101 },
};

describe("isAdmin", () => {
  it("is waar voor een beheerder, onwaar voor iedereen anders", () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(centraleRedacteur)).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe("isEditor", () => {
  it("is waar voor elke ingelogde CMS-gebruiker, onwaar voor niemand", () => {
    expect(isEditor(admin)).toBe(true);
    expect(isEditor(centraleRedacteur)).toBe(true);
    expect(isEditor(variantRedacteurMonti)).toBe(true);
    expect(isEditor(null)).toBe(false);
  });
});

describe("isCentralEditor", () => {
  it("is waar voor een beheerder en een editor zonder variantScope", () => {
    expect(isCentralEditor(admin)).toBe(true);
    expect(isCentralEditor(centraleRedacteur)).toBe(true);
  });

  it("is onwaar voor een variant-redacteur — mag nooit in de centrale boom schrijven", () => {
    expect(isCentralEditor(variantRedacteurMonti)).toBe(false);
    expect(isCentralEditor(variantRedacteurMontiRef)).toBe(false);
  });
});

describe("isVariantEditorFor", () => {
  it("is waar voor de variant-redacteur van precies die variant", () => {
    expect(isVariantEditorFor(variantRedacteurMonti, 101)).toBe(true);
    expect(isVariantEditorFor(variantRedacteurMontiRef, 101)).toBe(true);
  });

  it("is onwaar voor een andere variant dan de eigen variantScope", () => {
    expect(isVariantEditorFor(variantRedacteurMonti, 202)).toBe(false);
  });

  it("is onwaar voor een centrale redacteur (geen variantScope) op elke variant", () => {
    expect(isVariantEditorFor(centraleRedacteur, 101)).toBe(false);
  });

  it("is altijd waar voor een beheerder, ongeacht variant", () => {
    expect(isVariantEditorFor(admin, 101)).toBe(true);
    expect(isVariantEditorFor(admin, 202)).toBe(true);
  });
});
