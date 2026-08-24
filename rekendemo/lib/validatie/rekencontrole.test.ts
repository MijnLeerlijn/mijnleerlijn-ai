import { describe, expect, it } from "vitest";
import {
  controleerOpgave,
  leesAntwoordGetal,
  leesBerekening,
  leesGetal,
} from "./rekencontrole";

const opgave = (berekening: string | null, antwoord: string) => ({
  berekening,
  antwoord,
});

describe("leesBerekening", () => {
  const goed = [
    ["12 + 8 = 20", 20],
    ["45 - 17 = 28", 28],
    ["6 × 4 = 24", 24],
    ["6 x 4 = 24", 24],
    ["24 ÷ 6 = 4", 4],
    ["24 / 6 = 4", 4],
    ["2,5 + 1,5 = 4", 4],
    ["2.5 + 1.5 = 4", 4],
    ["  7*3=21  ", 21],
    ["24 : 6 = 4", 4],
  ] as const;

  it.each(goed)("herkent en berekent %s", (tekst, uitkomst) => {
    const gelezen = leesBerekening(tekst);
    expect(gelezen).not.toBeNull();
    expect(gelezen?.uitkomst).toBe(uitkomst);
    expect(gelezen?.opgegeven).toBe(uitkomst);
  });

  const nietHerkend = [
    "3 + 4 + 5 = 12",
    "de helft van 20 is 10",
    "6 × vier = 24",
    "20 ÷ 0 = 0",
    "1.500 + 500 = 2000",
    "",
  ];

  it.each(nietHerkend)("herkent %s niet als eenvoudige som", (tekst) => {
    expect(leesBerekening(tekst)).toBeNull();
  });
});

describe("leesGetal", () => {
  it("leest hele getallen en decimalen met punt of komma", () => {
    expect(leesGetal("24")).toBe(24);
    expect(leesGetal("2,5")).toBe(2.5);
    expect(leesGetal("2.5")).toBe(2.5);
    expect(leesGetal(" 12,50 ")).toBe(12.5);
  });

  it("leest dubbelzinnige vormen niet", () => {
    expect(leesGetal("1.500")).toBeNull();
    expect(leesGetal("1.2.3")).toBeNull();
    expect(leesGetal("twintig")).toBeNull();
    expect(leesGetal("12a")).toBeNull();
  });
});

describe("controleerOpgave - goede berekeningen", () => {
  const goed = [
    "12 + 8 = 20",
    "45 - 17 = 28",
    "6 × 4 = 24",
    "6 x 4 = 24",
    "24 ÷ 6 = 4",
    "24 / 6 = 4",
    "2,5 + 1,5 = 4",
    "2.5 + 1.5 = 4",
  ];

  it.each(goed)("keurt %s goed", (berekening) => {
    const uitkomst = leesBerekening(berekening)?.uitkomst;
    const controle = controleerOpgave(opgave(berekening, String(uitkomst)));
    expect(controle.status).toBe("correct");
    expect(controle.meldingen).toEqual([]);
  });
});

describe("controleerOpgave - foute berekeningen", () => {
  const fout = [
    ["6 × 4 = 25", "25"],
    ["10 - 3 = 8", "8"],
    ["20 / 4 = 6", "6"],
  ] as const;

  it.each(fout)("keurt %s af", (berekening, antwoord) => {
    const controle = controleerOpgave(opgave(berekening, antwoord));
    expect(controle.status).toBe("fout");
    expect(controle.meldingen[0]).toContain("onjuiste berekening");
    expect(controle.meldingen[0]).toContain(berekening);
  });
});

describe("controleerOpgave - antwoord vergelijken", () => {
  it("keurt een antwoord af dat niet bij de berekening past", () => {
    const controle = controleerOpgave(opgave("3 × 6 = 18", "19"));
    expect(controle.status).toBe("fout");
    expect(controle.meldingen[0]).toContain('antwoord "19"');
    expect(controle.antwoordGecontroleerd).toBe(true);
  });

  it.each(["24", "Afl. 24", "Cg 24", "24 mango's", " 24 "])(
    "vergelijkt antwoord %s met de uitkomst",
    (antwoord) => {
      const controle = controleerOpgave(opgave("6 × 4 = 24", antwoord));
      expect(controle.status).toBe("correct");
      expect(controle.antwoordGecontroleerd).toBe(true);
    },
  );

  it.each(["18 of 19", "twintig", "Afl. 12,50 per stuk, samen 25", "ongeveer 24 stuks en 3 over"])(
    "behandelt %s niet als numeriek antwoord",
    (antwoord) => {
      const controle = controleerOpgave(opgave("6 × 4 = 24", antwoord));
      expect(controle.status).toBe("correct");
      expect(controle.antwoordGecontroleerd).toBe(false);
    },
  );
});

describe("leesAntwoordGetal", () => {
  it("haalt één getal uit een antwoord met valuta of eenheid", () => {
    expect(leesAntwoordGetal("24")).toBe(24);
    expect(leesAntwoordGetal("Afl. 24")).toBe(24);
    expect(leesAntwoordGetal("Cg 24")).toBe(24);
    expect(leesAntwoordGetal("24 mango's")).toBe(24);
    expect(leesAntwoordGetal("Afl. 12,50")).toBe(12.5);
  });

  it("geeft niets terug bij twijfel", () => {
    expect(leesAntwoordGetal("18 of 19")).toBeNull();
    expect(leesAntwoordGetal("twintig")).toBeNull();
    expect(leesAntwoordGetal("")).toBeNull();
    expect(leesAntwoordGetal("Cg 1.500")).toBeNull();
  });
});

describe("controleerOpgave - niet controleerbaar", () => {
  it.each([
    [null, "berekening ontbreekt"],
    ["", "lege berekening"],
    ["3 + 4 + 5 = 12", "meer dan twee getallen"],
    ["de helft van 20 is 10", "geen som"],
  ])("markeert %s als niet controleerbaar (%s)", (berekening, _reden) => {
    const controle = controleerOpgave(opgave(berekening, "12"));
    expect(controle.status).toBe("niet_controleerbaar");
    expect(controle.meldingen).toEqual([]);
  });

  it("keurt een afgeronde deling niet af", () => {
    const controle = controleerOpgave(opgave("10 ÷ 3 = 3,33", "3,33"));
    expect(controle.status).toBe("niet_controleerbaar");
  });
});
