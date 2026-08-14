import { describe, it, expect } from "vitest";
import { vergelijkScholen, sorteerScholen, type SorteerbareSchool } from "./scholen-sortering";

function school(overrides: Partial<SorteerbareSchool> = {}): SorteerbareSchool {
  return {
    schoolName: "School",
    relatiestatus: null,
    onderwijstypeNaam: null,
    plaats: null,
    lastMondayActivityAt: null,
    volgendeActieDatum: null,
    ...overrides,
  };
}

describe("vergelijkScholen", () => {
  it("sorteert op schoolnaam, oplopend", () => {
    const a = school({ schoolName: "Bosschool" });
    const b = school({ schoolName: "Aanschool" });
    expect(vergelijkScholen(a, b, "schoolName", "oplopend")).toBeGreaterThan(0);
  });

  it("sorteert op schoolnaam, aflopend — exact omgekeerd van oplopend", () => {
    const a = school({ schoolName: "Bosschool" });
    const b = school({ schoolName: "Aanschool" });
    expect(vergelijkScholen(a, b, "schoolName", "aflopend")).toBeLessThan(0);
  });

  it("sorteert op laatste contact, oudste eerst (oplopend) — een school zonder contact (null) telt als oudst", () => {
    const nooitGecontacteerd = school({ schoolName: "X", lastMondayActivityAt: null });
    const recent = school({ schoolName: "Y", lastMondayActivityAt: "2026-08-01T00:00:00.000Z" });
    expect(vergelijkScholen(nooitGecontacteerd, recent, "laatsteContact", "oplopend")).toBeLessThan(0);
  });

  it("sorteert op volgende actie", () => {
    const vroeg = school({ volgendeActieDatum: "2026-08-01" });
    const laat = school({ volgendeActieDatum: "2026-09-01" });
    expect(vergelijkScholen(vroeg, laat, "volgendeActie", "oplopend")).toBeLessThan(0);
  });

  it("sorteert op relatiestatus/onderwijstype/plaats (tekstueel, NL-locale)", () => {
    const a = school({ relatiestatus: "Prospect", onderwijstypeNaam: "MijnMonti", plaats: "Zwolle" });
    const b = school({ relatiestatus: "Klant", onderwijstypeNaam: "Algemeen", plaats: "Amsterdam" });
    expect(vergelijkScholen(a, b, "relatiestatus", "oplopend")).toBeGreaterThan(0);
    expect(vergelijkScholen(a, b, "onderwijstype", "oplopend")).toBeGreaterThan(0);
    expect(vergelijkScholen(a, b, "plaats", "oplopend")).toBeGreaterThan(0);
  });
});

describe("sorteerScholen", () => {
  it("geeft de originele lijst ongewijzigd terug wanneer geen kolom gekozen is", () => {
    const lijst = [school({ schoolName: "B" }), school({ schoolName: "A" })];
    expect(sorteerScholen(lijst, null, "oplopend")).toEqual(lijst);
  });

  it("muteert de originele array niet", () => {
    const lijst = [school({ schoolName: "B" }), school({ schoolName: "A" })];
    const kopie = [...lijst];
    sorteerScholen(lijst, "schoolName", "oplopend");
    expect(lijst).toEqual(kopie);
  });

  it("combineert correct met een al gefilterde deellijst — expliciet scenario: Prospect + geen volgende actie, oudste contact eerst", () => {
    // Simuleert wat SalesScholenView.tsx doet: eerst filteren (hier al gedaan
    // — alleen Prospect-scholen zonder volgende actie zitten al in de
    // lijst), dan sorteren op laatsteContact/oplopend.
    const gefilterd: SorteerbareSchool[] = [
      school({ schoolName: "Recent gecontacteerd", relatiestatus: "Prospect", lastMondayActivityAt: "2026-08-10T00:00:00.000Z" }),
      school({ schoolName: "Nooit gecontacteerd", relatiestatus: "Prospect", lastMondayActivityAt: null }),
      school({ schoolName: "Lang geleden", relatiestatus: "Prospect", lastMondayActivityAt: "2026-01-01T00:00:00.000Z" }),
    ];

    const gesorteerd = sorteerScholen(gefilterd, "laatsteContact", "oplopend");

    expect(gesorteerd.map((s) => s.schoolName)).toEqual(["Nooit gecontacteerd", "Lang geleden", "Recent gecontacteerd"]);
  });
});
