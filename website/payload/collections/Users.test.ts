import { describe, it, expect } from "vitest";
import { Users } from "./Users";
import type { AuthUser } from "../access/roles";
import type { AuthUserMetPermissies } from "../access/menu-permissions";

// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25).
// Zelfde fake-args-conventie als payload/access/roles.test.ts
// (fn({ req: { user } } as never)).

type Gebruiker = AuthUser & AuthUserMetPermissies;

const volledigeAdmin: Gebruiker = { id: 1, role: "admin", permissionMode: "full" } as never;
const beperkteAdminMetGebruikersToegang: Gebruiker = {
  id: 2,
  role: "admin",
  permissionMode: "restricted",
  permissions: ["algemeen.gebruikers"],
} as never;
const beperkteAdminZonderGebruikersToegang: Gebruiker = {
  id: 3,
  role: "admin",
  permissionMode: "restricted",
  permissions: ["trainers.dashboard"],
} as never;
const redacteur: Gebruiker = { id: 4, role: "editor", permissionMode: "full" } as never;

describe("Users.access.read", () => {
  it("een onbeperkte ('full') admin ziet alle gebruikers", () => {
    expect(Users.access!.read!({ req: { user: volledigeAdmin } } as never)).toBe(true);
  });

  it("een beperkte admin MET 'algemeen.gebruikers' ziet alle gebruikers", () => {
    expect(Users.access!.read!({ req: { user: beperkteAdminMetGebruikersToegang } } as never)).toBe(true);
  });

  it("een beperkte admin ZONDER 'algemeen.gebruikers' ziet uitsluitend het eigen account, niet 'geen toegang'", () => {
    expect(Users.access!.read!({ req: { user: beperkteAdminZonderGebruikersToegang } } as never)).toEqual({ id: { equals: 3 } });
  });

  it("een redacteur ziet uitsluitend het eigen account (rol-gedrag ongewijzigd)", () => {
    expect(Users.access!.read!({ req: { user: redacteur } } as never)).toEqual({ id: { equals: 4 } });
  });

  it("geen toegang zonder ingelogde gebruiker", () => {
    expect(Users.access!.read!({ req: { user: null } } as never)).toBe(false);
  });
});

describe("Users.access.update", () => {
  it("een beperkte admin ZONDER 'algemeen.gebruikers' kan nog altijd het eigen account bijwerken (basale sessie-identiteit blijft werken)", () => {
    expect(Users.access!.update!({ req: { user: beperkteAdminZonderGebruikersToegang } } as never)).toEqual({ id: { equals: 3 } });
  });

  it("een beperkte admin MET 'algemeen.gebruikers' kan alle accounts bijwerken", () => {
    expect(Users.access!.update!({ req: { user: beperkteAdminMetGebruikersToegang } } as never)).toBe(true);
  });
});

// Zoekt het permissionMode- en permissions-veld op binnen de "Toegang & menu"-tab.
const tabsVeld = Users.fields[0] as { tabs: Array<{ label: string; fields: Array<{ name?: string; access?: { update: (args: unknown) => boolean } }> }> };
const toegangTab = tabsVeld.tabs.find((tab) => tab.label === "Toegang & menu")!;
const permissionModeVeld = toegangTab.fields.find((f) => f.name === "permissionMode")!;
const permissionsVeld = toegangTab.fields.find((f) => f.name === "permissions")!;

describe("Users — zelfbeveiliging op permissionMode/permissions (opdrachtseis §5/§9)", () => {
  it("een admin kan permissionMode/permissions van EEN ANDER account wijzigen", () => {
    expect(permissionModeVeld.access!.update({ req: { user: volledigeAdmin }, id: 2 } as never)).toBe(true);
    expect(permissionsVeld.access!.update({ req: { user: volledigeAdmin }, id: 2 } as never)).toBe(true);
  });

  it("een admin kan NOOIT permissionMode/permissions van het EIGEN account wijzigen — voorkomt zowel zelf-buitensluiten als zelf-verhogen", () => {
    expect(permissionModeVeld.access!.update({ req: { user: volledigeAdmin }, id: 1 } as never)).toBe(false);
    expect(permissionsVeld.access!.update({ req: { user: volledigeAdmin }, id: 1 } as never)).toBe(false);
    // Ook een reeds-beperkte admin kan zichzelf niet terug naar "full" zetten.
    expect(permissionModeVeld.access!.update({ req: { user: beperkteAdminMetGebruikersToegang }, id: 2 } as never)).toBe(false);
  });

  it("id als string ('2') wordt net zo herkend als het eigen account als id als number (2) — geen type-mismatch-lek", () => {
    expect(permissionModeVeld.access!.update({ req: { user: volledigeAdmin }, id: "1" } as never)).toBe(false);
  });

  it("een admin kan deze velden wél zetten bij het AANMAKEN van een nieuw account (geen id — nooit 'jezelf')", () => {
    expect(permissionModeVeld.access!.update({ req: { user: volledigeAdmin }, id: undefined } as never)).toBe(true);
  });

  it("een redacteur (geen admin-rol) kan deze velden nooit wijzigen, ook niet van een ander account", () => {
    expect(permissionModeVeld.access!.update({ req: { user: redacteur }, id: 2 } as never)).toBe(false);
  });
});
