import { describe, it, expect } from "vitest";
import { bepaalWidgetTiers, type KandidaatSchool, type OpenActieBasis, type VoorstelBasis } from "./widget-prioritering";

// Sales UX V2 (2026-08-14) — deterministische widget-prioritering. Pure
// functie, geen mocking nodig: precies de garanties die de opdracht
// expliciet vraagt (tier-volgorde, Klant/Gestopt/Inactief-regels, max 5).
const VANDAAG = "2026-08-14";

function school(overrides: Partial<KandidaatSchool> & { id: number }): KandidaatSchool {
  return { schoolName: `School ${overrides.id}`, relatiestatus: "Lead", plaats: null, onderwijstype: null, lastMondayActivityAt: null, ...overrides };
}

describe("bepaalWidgetTiers — tiervolgorde", () => {
  it("tier 1 (open actie vandaag/achterstallig) gaat altijd vóór tier 2/3/4", () => {
    const scholen = [school({ id: 1, relatiestatus: "Lead" }), school({ id: 2, relatiestatus: "Prospect" })];
    const acties: OpenActieBasis[] = [{ schoolId: 1, dueDate: "2026-08-14", description: "Bellen vandaag" }];
    const voorstellen: VoorstelBasis[] = [{ schoolId: 2, confidence: "hoog", reason: "Vroeg om demo", createdAt: "2026-08-13T00:00:00.000Z" }];

    const resultaat = bepaalWidgetTiers(scholen, acties, voorstellen, VANDAAG, 5);

    expect(resultaat[0]?.id).toBe(1);
    expect(resultaat[0]?.tier).toBe(1);
    expect(resultaat[1]?.id).toBe(2);
    expect(resultaat[1]?.tier).toBe(2);
  });

  it("een toekomstige (nog niet achterstallige) actie telt niet mee voor tier 1", () => {
    const scholen = [school({ id: 1 })];
    const acties: OpenActieBasis[] = [{ schoolId: 1, dueDate: "2026-08-20", description: "Later" }];

    const resultaat = bepaalWidgetTiers(scholen, acties, [], VANDAAG, 5);

    expect(resultaat).toHaveLength(0);
  });

  it("hoog-vertrouwen-voorstel (tier 2) gaat vóór middel-vertrouwen (tier 3)", () => {
    const scholen = [school({ id: 1 }), school({ id: 2 })];
    const voorstellen: VoorstelBasis[] = [
      { schoolId: 1, confidence: "middel", reason: "x", createdAt: "2026-08-13T00:00:00.000Z" },
      { schoolId: 2, confidence: "hoog", reason: "y", createdAt: "2026-08-13T00:00:00.000Z" },
    ];

    const resultaat = bepaalWidgetTiers(scholen, [], voorstellen, VANDAAG, 5);

    expect(resultaat[0]?.id).toBe(2);
    expect(resultaat[0]?.tier).toBe(2);
    expect(resultaat[1]?.id).toBe(1);
    expect(resultaat[1]?.tier).toBe(3);
  });

  it("laag-vertrouwen-voorstellen worden nooit getoond", () => {
    const scholen = [school({ id: 1 })];
    const voorstellen: VoorstelBasis[] = [{ schoolId: 1, confidence: "laag", reason: "x", createdAt: "2026-08-13T00:00:00.000Z" }];

    const resultaat = bepaalWidgetTiers(scholen, [], voorstellen, VANDAAG, 5);

    expect(resultaat).toHaveLength(0);
  });

  it("tier 4 (veiligheidsnet) sorteert op langst-stil-eerst, null/nooit wint van elke bekende datum", () => {
    const scholen = [
      school({ id: 1, lastMondayActivityAt: "2026-08-01T00:00:00.000Z" }),
      school({ id: 2, lastMondayActivityAt: null }),
      school({ id: 3, lastMondayActivityAt: "2026-07-01T00:00:00.000Z" }),
    ];

    const resultaat = bepaalWidgetTiers(scholen, [], [], VANDAAG, 5);

    expect(resultaat.map((r) => r.id)).toEqual([2, 3, 1]);
    expect(resultaat.every((r) => r.tier === 4)).toBe(true);
  });

  it("stopt bij maxItems, ook als er meer kandidaten in lagere tiers zijn", () => {
    const scholen = Array.from({ length: 10 }, (_, i) => school({ id: i + 1 }));

    const resultaat = bepaalWidgetTiers(scholen, [], [], VANDAAG, 5);

    expect(resultaat).toHaveLength(5);
  });

  it("eenzelfde school komt nooit dubbel voor (open actie én pending voorstel tegelijk telt maar één keer, als tier 1)", () => {
    const scholen = [school({ id: 1 })];
    const acties: OpenActieBasis[] = [{ schoolId: 1, dueDate: "2026-08-14", description: "Bellen" }];
    const voorstellen: VoorstelBasis[] = [{ schoolId: 1, confidence: "hoog", reason: "x", createdAt: "2026-08-13T00:00:00.000Z" }];

    const resultaat = bepaalWidgetTiers(scholen, acties, voorstellen, VANDAAG, 5);

    expect(resultaat).toHaveLength(1);
    expect(resultaat[0]?.tier).toBe(1);
  });
});

describe("bepaalWidgetTiers — Klant/Gestopt/Inactief-regels (expliciete bouweis)", () => {
  it("een Klant met een openstaande actie vandaag verschijnt via tier 1", () => {
    const scholen = [school({ id: 1, relatiestatus: "Klant" })];
    const acties: OpenActieBasis[] = [{ schoolId: 1, dueDate: "2026-08-14", description: "Upsell-gesprek" }];

    const resultaat = bepaalWidgetTiers(scholen, acties, [], VANDAAG, 5);

    expect(resultaat).toHaveLength(1);
    expect(resultaat[0]?.tier).toBe(1);
  });

  it("een Klant met een hoog-vertrouwen AI-voorstel verschijnt NIET (alleen tier 1 geldt voor Klant)", () => {
    const scholen = [school({ id: 1, relatiestatus: "Klant" })];
    const voorstellen: VoorstelBasis[] = [{ schoolId: 1, confidence: "hoog", reason: "x", createdAt: "2026-08-13T00:00:00.000Z" }];

    const resultaat = bepaalWidgetTiers(scholen, [], voorstellen, VANDAAG, 5);

    expect(resultaat).toHaveLength(0);
  });

  it("een Klant zonder actie/voorstel verschijnt NIET via het veiligheidsnet (tier 4)", () => {
    const scholen = [school({ id: 1, relatiestatus: "Klant", lastMondayActivityAt: null })];

    const resultaat = bepaalWidgetTiers(scholen, [], [], VANDAAG, 5);

    expect(resultaat).toHaveLength(0);
  });

  it.each(["Gestopt", "Inactief"])("een school met status '%s' verschijnt nooit, ook niet met een openstaande actie vandaag", (status) => {
    const scholen = [school({ id: 1, relatiestatus: status })];
    const acties: OpenActieBasis[] = [{ schoolId: 1, dueDate: "2026-08-14", description: "x" }];
    const voorstellen: VoorstelBasis[] = [{ schoolId: 1, confidence: "hoog", reason: "x", createdAt: "2026-08-13T00:00:00.000Z" }];

    const resultaat = bepaalWidgetTiers(scholen, acties, voorstellen, VANDAAG, 5);

    expect(resultaat).toHaveLength(0);
  });
});
