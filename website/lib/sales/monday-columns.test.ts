import { describe, it, expect } from "vitest";
import { isGemigreerdeUpdate, isOpenstaandeRelatiestatus, MIGRATIE_MARKER } from "./monday-columns";

describe("isGemigreerdeUpdate", () => {
  it("herkent de letterlijke, live aangetroffen migratiemarker", () => {
    expect(isGemigreerdeUpdate(`${MIGRATIE_MARKER} (oud Sales-board)\nOude salesgroep: Beslissen`)).toBe(true);
  });

  it("herkent de marker ook met voorloop-witruimte", () => {
    expect(isGemigreerdeUpdate(`   ${MIGRATIE_MARKER} (oud Sales-board)`)).toBe(true);
  });

  it("beschouwt een normaal contactverslag niet als gemigreerd", () => {
    expect(isGemigreerdeUpdate("Beste Michel, leuk dat je contact opnam...")).toBe(false);
  });

  it("beschouwt lege tekst niet als gemigreerd", () => {
    expect(isGemigreerdeUpdate("")).toBe(false);
  });
});

describe("isOpenstaandeRelatiestatus", () => {
  it.each(["Lead", "Prospect", "Wacht op handtekening"])("beschouwt live bevestigde openstaande waarde '%s' als openstaand", (waarde) => {
    expect(isOpenstaandeRelatiestatus(waarde)).toBe(true);
  });

  it.each(["Klant", "Gestopt", "Inactief"])("beschouwt live bevestigde gesloten waarde '%s' niet als openstaand", (waarde) => {
    expect(isOpenstaandeRelatiestatus(waarde)).toBe(false);
  });

  it("beschouwt null/undefined niet als openstaand", () => {
    expect(isOpenstaandeRelatiestatus(null)).toBe(false);
    expect(isOpenstaandeRelatiestatus(undefined)).toBe(false);
  });

  it("verzint geen match voor een niet-bevestigde waarde (bv. een toekomstige, nieuwe Monday-status)", () => {
    expect(isOpenstaandeRelatiestatus("Onderhandeling")).toBe(false);
  });
});
