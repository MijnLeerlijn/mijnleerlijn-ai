import { describe, it, expect } from "vitest";
import { heeftAdminPermissie, permissieOnly, type AuthUserMetPermissies } from "./menu-permissions";
import { adminOnly, ownRecordAccess } from "./roles";

// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25).
// Zelfde fake-args-conventie als roles.test.ts (fn({ req: { user } } as never)).

const admin: AuthUserMetPermissies = { id: 1, role: "admin", permissionMode: "full" } as never;
const admin_zonderVeld: AuthUserMetPermissies = { id: 1, role: "admin" } as never;
const beperkteAdmin: AuthUserMetPermissies = {
  id: 2,
  role: "admin",
  permissionMode: "restricted",
  permissions: ["trainers.dashboard", "trainers.trainingen"],
} as never;
const beperkteAdminZonderPermissies: AuthUserMetPermissies = { id: 3, role: "admin", permissionMode: "restricted" } as never;

describe("heeftAdminPermissie", () => {
  it("geeft false zonder ingelogde gebruiker", () => {
    expect(heeftAdminPermissie(null, "trainers.dashboard")).toBe(false);
    expect(heeftAdminPermissie(undefined, "trainers.dashboard")).toBe(false);
  });

  it("geeft true voor elke permissie zolang permissionMode niet 'restricted' is (backwards-compatible default)", () => {
    expect(heeftAdminPermissie(admin, "trainers.telefonie")).toBe(true);
    expect(heeftAdminPermissie(admin, "willekeurige.onbekende.id")).toBe(true);
    // Ontbrekend permissionMode (elk bestaand account vóór/na migratie zonder expliciete keuze) — zelfde als "full".
    expect(heeftAdminPermissie(admin_zonderVeld, "trainers.telefonie")).toBe(true);
  });

  it("een 'restricted'-gebruiker heeft uitsluitend de expliciet toegekende permissie-ID's", () => {
    expect(heeftAdminPermissie(beperkteAdmin, "trainers.dashboard")).toBe(true);
    expect(heeftAdminPermissie(beperkteAdmin, "trainers.trainingen")).toBe(true);
    expect(heeftAdminPermissie(beperkteAdmin, "trainers.telefonie")).toBe(false);
    expect(heeftAdminPermissie(beperkteAdmin, "sales.overzicht")).toBe(false);
  });

  it("een 'restricted'-gebruiker zonder permissions-array heeft nergens toegang toe (geen crash op ontbrekend veld)", () => {
    expect(heeftAdminPermissie(beperkteAdminZonderPermissies, "trainers.dashboard")).toBe(false);
  });
});

describe("permissieOnly", () => {
  it("geeft het resultaat van de bestaande rolcheck ongewijzigd terug wanneer de permissie is toegekend", async () => {
    const gated = permissieOnly("trainers.dashboard", adminOnly);
    expect(await gated({ req: { user: beperkteAdmin } } as never)).toBe(true);
  });

  it("weigert (false) wanneer de rolcheck slaagt maar de permissie ontbreekt", async () => {
    const gated = permissieOnly("trainers.telefonie", adminOnly);
    expect(await gated({ req: { user: beperkteAdmin } } as never)).toBe(false);
  });

  it("weigert (false) wanneer de bestaande rolcheck al faalt, ongeacht permissies — de wrapper kan nooit méér toestaan dan de rol", async () => {
    const redacteurMetAllePermissies: AuthUserMetPermissies = {
      id: 4,
      role: "editor",
      permissionMode: "restricted",
      permissions: ["trainers.telefonie"],
    } as never;
    const gated = permissieOnly("trainers.telefonie", adminOnly);
    expect(await gated({ req: { user: redacteurMetAllePermissies } } as never)).toBe(false);
  });

  it("laat een Where-object (rijgebonden scoping) van de onderliggende rolcheck intact wanneer de permissie is toegekend", async () => {
    const gated = permissieOnly("algemeen.gebruikers", ownRecordAccess);
    const resultaat = await gated({ req: { user: beperkteAdminZonderPermissies } } as never);
    // beperkteAdminZonderPermissies heeft GEEN "algemeen.gebruikers" toegekend
    // — moet dus false zijn, niet de Where-clause.
    expect(resultaat).toBe(false);

    const metPermissie: AuthUserMetPermissies = {
      id: 5,
      role: "admin",
      permissionMode: "restricted",
      permissions: ["algemeen.gebruikers"],
    } as never;
    const resultaatMetPermissie = await gated({ req: { user: metPermissie } } as never);
    expect(resultaatMetPermissie).toEqual({ eigenaar: { equals: 5 } });
  });

  it("gedraagt zich identiek aan de kale rolcheck voor een onbeperkt ('full') account — geen gedragsverandering voor bestaande accounts", async () => {
    const gated = permissieOnly("trainers.telefonie", adminOnly);
    expect(await gated({ req: { user: admin } } as never)).toBe(true);
    expect(await adminOnly({ req: { user: admin } } as never)).toBe(true);
  });
});
