import { describe, it, expect } from "vitest";
import { parseQuickAdd, type QuickAddSchoolOptie } from "./quick-add-parser";

// Vaste "vandaag" i.p.v. de systeemklok — deterministisch, geen flakiness.
// 2026-08-17 is een maandag.
const VANDAAG = "2026-08-17";

const SCHOLEN: QuickAddSchoolOptie[] = [
  { id: 1, schoolName: "Springplank" },
  { id: 2, schoolName: "Stichting Komma" },
  { id: 3, schoolName: "Montessorischool De Boog" },
];

describe("parseQuickAdd — taak zonder datum (amendement 1: een volwaardige, verwachte uitkomst)", () => {
  it("levert datum: null wanneer geen datumtrefwoord herkend wordt — geen AI-fallback, geen foutgeval", () => {
    const voorstel = parseQuickAdd("Voorstel Stichting Komma afmaken", VANDAAG);
    expect(voorstel.datum).toBeNull();
    expect(voorstel.tijd).toBeNull();
    expect(voorstel.titel).toBe("Voorstel Stichting Komma afmaken");
  });

  it("herkent de school ook zonder datum ('indien betrouwbaar herkend')", () => {
    const voorstel = parseQuickAdd("Voorstel Stichting Komma afmaken", VANDAAG, SCHOLEN);
    expect(voorstel.schoolId).toBe(2);
    expect(voorstel.schoolName).toBe("Stichting Komma");
  });
});

describe("parseQuickAdd — taak met datum (het expliciete opdrachtvoorbeeld)", () => {
  it("'Vrijdag voorstel Stichting Komma afmaken' → datum op de eerstvolgende vrijdag, titel zonder de datumfrase", () => {
    const voorstel = parseQuickAdd("Vrijdag voorstel Stichting Komma afmaken", VANDAAG, SCHOLEN);
    expect(voorstel.datum).toBe("2026-08-21"); // eerstvolgende vrijdag na maandag 17 aug
    expect(voorstel.titel).toBe("Voorstel Stichting Komma afmaken");
    expect(voorstel.schoolId).toBe(2);
  });

  it("'Vrijdag presentatie Montessori afmaken' — titel begint met een hoofdletter, ook al was de invoer na het strippen kleine letter", () => {
    const voorstel = parseQuickAdd("Vrijdag presentatie Montessori afmaken", VANDAAG);
    expect(voorstel.datum).toBe("2026-08-21");
    expect(voorstel.titel).toBe("Presentatie Montessori afmaken");
    expect(voorstel.tijd).toBeNull();
  });

  it("een genoemde weekdag die vandaag zelf is, geldt als vandaag (eerstvolgende, inclusief vandaag)", () => {
    // VANDAAG (2026-08-17) is een maandag.
    const voorstel = parseQuickAdd("Maandag bellen", VANDAAG);
    expect(voorstel.datum).toBe(VANDAAG);
  });

  it("herkent 'vandaag'/'morgen'/'overmorgen' expliciet, 'overmorgen' nooit verward met 'morgen'", () => {
    expect(parseQuickAdd("Bellen vandaag", VANDAAG).datum).toBe("2026-08-17");
    expect(parseQuickAdd("Bellen morgen", VANDAAG).datum).toBe("2026-08-18");
    expect(parseQuickAdd("Bellen overmorgen", VANDAAG).datum).toBe("2026-08-19");
  });

  it("herkent 'over N dagen'/'over een week'", () => {
    expect(parseQuickAdd("Terugbellen over 3 dagen", VANDAAG).datum).toBe("2026-08-20");
    expect(parseQuickAdd("Terugbellen over een week", VANDAAG).datum).toBe("2026-08-24");
  });

  it("herkent een expliciete '24 augustus'-datum, en telt bij een al gepasseerde datum zonder jaartal automatisch een jaar door", () => {
    expect(parseQuickAdd("Afspraak 24 augustus", VANDAAG).datum).toBe("2026-08-24");
    // 1 januari is dit kalenderjaar al voorbij t.o.v. 17 augustus.
    expect(parseQuickAdd("Nieuwjaarsborrel 1 januari", VANDAAG).datum).toBe("2027-01-01");
  });

  it("herkent numerieke datumnotatie '24-08' en '24/08/2026'", () => {
    expect(parseQuickAdd("Afspraak 24-08", VANDAAG).datum).toBe("2026-08-24");
    expect(parseQuickAdd("Afspraak 24/08/2026", VANDAAG).datum).toBe("2026-08-24");
  });
});

describe("parseQuickAdd — taak met tijd", () => {
  it("herkent 'om HH:MM' en laat die frase uit de titel", () => {
    const voorstel = parseQuickAdd("Bel morgen om 14:30 met Springplank", VANDAAG, SCHOLEN);
    expect(voorstel.tijd).toBe("14:30");
    expect(voorstel.datum).toBe("2026-08-18");
    expect(voorstel.titel).toBe("Bel met Springplank");
    expect(voorstel.schoolId).toBe(1);
  });

  it("herkent 'om H uur'", () => {
    expect(parseQuickAdd("Bellen om 9 uur", VANDAAG).tijd).toBe("09:00");
  });
});

describe("parseQuickAdd — gedegenereerde invoer (uitsluitend een datum-/tijdfrase)", () => {
  it("behoudt de oorspronkelijke tekst als titel i.p.v. een lege titel — geen AI-call nodig", () => {
    const voorstel = parseQuickAdd("vrijdag", VANDAAG);
    expect(voorstel.datum).toBe("2026-08-21");
    expect(voorstel.titel).toBe("Vrijdag");
  });
});

describe("parseQuickAdd — schoolherkenning", () => {
  it("kiest bij meerdere gedeeltelijke matches de langste (meest specifieke) schoolnaam", () => {
    const voorstel = parseQuickAdd("Bellen met Montessorischool De Boog over het voorstel", VANDAAG, SCHOLEN);
    expect(voorstel.schoolId).toBe(3);
  });

  it("levert schoolId: null wanneer geen enkele schoolnaam voorkomt — geen gok", () => {
    const voorstel = parseQuickAdd("Bellen met een school", VANDAAG, SCHOLEN);
    expect(voorstel.schoolId).toBeNull();
    expect(voorstel.schoolName).toBeNull();
  });

  it("werkt zonder meegegeven scholenlijst (optioneel argument)", () => {
    const voorstel = parseQuickAdd("Iets doen", VANDAAG);
    expect(voorstel.schoolId).toBeNull();
  });
});
