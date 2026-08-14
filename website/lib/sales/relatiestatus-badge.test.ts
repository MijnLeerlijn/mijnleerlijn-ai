import { describe, it, expect } from "vitest";
import { relatiestatusBadgeInfo, RELATIESTATUS_BADGE } from "./relatiestatus-badge";

// Sales UX V2 (2026-08-14) — centrale, bevestigde kleurmapping (niet
// aangenomen — expliciet door de opdrachtgever gekozen).
describe("relatiestatusBadgeInfo", () => {
  it.each([
    ["Lead", "blue"],
    ["Prospect", "purple"],
    ["Wacht op handtekening", "orange"],
    ["Klant", "green"],
    ["Gestopt", "red"],
    ["Inactief", "slate"],
  ])("mapt '%s' naar kleur '%s'", (waarde, verwachteKleur) => {
    expect(relatiestatusBadgeInfo(waarde).kleur).toBe(verwachteKleur);
    expect(relatiestatusBadgeInfo(waarde).label).toBe(waarde);
  });

  it("valt terug op een neutrale 'Onbekend'-badge bij null/undefined", () => {
    expect(relatiestatusBadgeInfo(null)).toEqual({ label: "Onbekend", kleur: "slate" });
    expect(relatiestatusBadgeInfo(undefined)).toEqual({ label: "Onbekend", kleur: "slate" });
  });

  it("verzint geen kleur voor een onbekende/toekomstige statuswaarde — toont de waarde zelf, neutrale kleur", () => {
    expect(relatiestatusBadgeInfo("Onderhandeling")).toEqual({ label: "Onderhandeling", kleur: "slate" });
  });

  it("bevat precies de 6 live-bevestigde statuswaarden, niet meer en niet minder", () => {
    expect(Object.keys(RELATIESTATUS_BADGE).sort()).toEqual(["Gestopt", "Inactief", "Klant", "Lead", "Prospect", "Wacht op handtekening"].sort());
  });
});
