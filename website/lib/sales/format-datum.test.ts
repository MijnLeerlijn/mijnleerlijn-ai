import { describe, it, expect } from "vitest";
import { formatKorteDatum, formatKorteDatumTijd, dagenSinds, typeLabel, lokaleDatumIso, vandaagIso, voegDagenToe } from "./format-datum";

describe("lokaleDatumIso — timezone-veilige kalenderdatum (productiecorrectie 2026-08-16)", () => {
  it("gebruikt de lokale (browser-)tijdzone via getFullYear/getMonth/getDate, nooit UTC", () => {
    // new Date(jaar, maand0-indexed, dag) construeert een moment in de LOKALE
    // tijdzone van de test-runner — lokaleDatumIso moet exact diezelfde
    // kalenderdatum teruggeven, ongeacht welke tijdzone de runner heeft. Dit
    // is de daadwerkelijke, deterministische garantie: geen toISOString()/
    // getUTC*-aanroep ertussen die een dag zou kunnen laten opschuiven.
    expect(lokaleDatumIso(new Date(2026, 10, 3))).toBe("2026-11-03");
    expect(lokaleDatumIso(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(lokaleDatumIso(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("zero-padt maand en dag onder de 10", () => {
    expect(lokaleDatumIso(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("houdt rekening met tijd-op-de-dag zonder de kalenderdatum te laten verschuiven (geen UTC-conversie ertussen)", () => {
    expect(lokaleDatumIso(new Date(2026, 10, 3, 0, 30))).toBe("2026-11-03");
    expect(lokaleDatumIso(new Date(2026, 10, 3, 23, 59))).toBe("2026-11-03");
  });
});

describe("vandaagIso — vervangt de vroegere UTC-gebaseerde duplicaten in SalesDashboardPaneel/SalesVandaagView", () => {
  it("levert exact lokaleDatumIso(new Date()) — geen eigen, afwijkende berekening", () => {
    expect(vandaagIso()).toBe(lokaleDatumIso(new Date()));
  });

  it("levert een geldige YYYY-MM-DD-string", () => {
    expect(vandaagIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("voegDagenToe — puur kalenderrekenen op YYYY-MM-DD-strings", () => {
  it("telt op en trekt af binnen dezelfde maand", () => {
    expect(voegDagenToe("2026-11-03", 1)).toBe("2026-11-04");
    expect(voegDagenToe("2026-11-03", 2)).toBe("2026-11-05");
    expect(voegDagenToe("2026-11-03", -1)).toBe("2026-11-02");
    expect(voegDagenToe("2026-11-03", 0)).toBe("2026-11-03");
  });

  it("rolt correct over een maandgrens", () => {
    expect(voegDagenToe("2026-11-30", 1)).toBe("2026-12-01");
    expect(voegDagenToe("2026-12-01", -1)).toBe("2026-11-30");
  });

  it("rolt correct over een jaargrens", () => {
    expect(voegDagenToe("2026-12-31", 1)).toBe("2027-01-01");
    expect(voegDagenToe("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("bestaande functies ongewijzigd (regressie)", () => {
  it("formatKorteDatum/formatKorteDatumTijd/dagenSinds/typeLabel blijven werken zoals voorheen", () => {
    expect(formatKorteDatum(null)).toBe("—");
    expect(formatKorteDatum("2026-03-13T00:00:00.000Z")).toContain("2026");
    expect(formatKorteDatumTijd(null)).toBe("—");
    expect(dagenSinds(null)).toBeNull();
    expect(typeLabel("contact")).toBe("Contact");
  });
});
