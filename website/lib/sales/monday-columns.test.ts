import { describe, it, expect } from "vitest";
import { isGemigreerdeUpdate, isOpenstaandeRelatiestatus, MIGRATIE_MARKER, probeerGemigreerdeDatumTeExtraheren } from "./monday-columns";

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

// Sales UX V2 (2026-08-14) — conservatieve datumparser voor gemigreerde
// Updates, gebaseerd op precies één live-bevestigd voorbeeld
// ("13/March/2026"). Bewust NIET uitgebreid met ongeverifieerde varianten —
// zie het commentaar bij de functie zelf en het opleverrapport.
describe("probeerGemigreerdeDatumTeExtraheren", () => {
  it("herkent het live-bevestigde patroon 'D/Maandnaam/JJJJ' (Engelse maandnaam)", () => {
    const resultaat = probeerGemigreerdeDatumTeExtraheren(`${MIGRATIE_MARKER} (oud Sales-board)\n13/March/2026: gesprek gehad met de directeur.`);
    expect(resultaat).toBe(new Date(Date.UTC(2026, 2, 13)).toISOString());
  });

  it("herkent ook een dubbele dagnotatie (DD/Maandnaam/JJJJ)", () => {
    const resultaat = probeerGemigreerdeDatumTeExtraheren("Notitie: 04/September/2025 telefonisch contact.");
    expect(resultaat).toBe(new Date(Date.UTC(2025, 8, 4)).toISOString());
  });

  it("is niet hoofdlettergevoelig op de maandnaam", () => {
    expect(probeerGemigreerdeDatumTeExtraheren("13/march/2026")).toBe(new Date(Date.UTC(2026, 2, 13)).toISOString());
    expect(probeerGemigreerdeDatumTeExtraheren("13/MARCH/2026")).toBe(new Date(Date.UTC(2026, 2, 13)).toISOString());
  });

  it("geeft null bij een niet-herkende maandnaam — bij twijfel niet gokken", () => {
    expect(probeerGemigreerdeDatumTeExtraheren("13/Maart/2026")).toBeNull(); // Nederlandse maandnaam, niet het bevestigde patroon
  });

  it("geeft null bij een ongeldige kalenderdatum (bv. 31 februari)", () => {
    expect(probeerGemigreerdeDatumTeExtraheren("31/February/2026")).toBeNull();
  });

  it("geeft null wanneer er helemaal geen datumpatroon voorkomt", () => {
    expect(probeerGemigreerdeDatumTeExtraheren(`${MIGRATIE_MARKER} (oud Sales-board)\nOude salesgroep: Beslissen`)).toBeNull();
  });

  it("geeft null bij een datum ver buiten het zoekvenster (niet vooraan in de tekst)", () => {
    const vulling = "x".repeat(320);
    expect(probeerGemigreerdeDatumTeExtraheren(`${vulling}13/March/2026`)).toBeNull();
  });

  it("geeft null bij lege tekst", () => {
    expect(probeerGemigreerdeDatumTeExtraheren("")).toBeNull();
  });
});
