import { describe, expect, it } from "vitest";
import type { Opgave, WerkbladResultaat } from "@/lib/resultaat";
import { STANDAARD_INSTELLINGEN, type WerkbladInstellingen } from "@/lib/werkblad";
import { validateWerkbladResultaat } from "./validateWerkbladResultaat";

const instellingen: WerkbladInstellingen = {
  ...STANDAARD_INSTELLINGEN,
  rekendoel: "Ik kan tafels tot 10 oefenen.",
  opgaveType: "kaal",
  aantalOpgaven: 5,
  leerjaar: 4,
};

const kaleOpgave = (nummer: number, berekening: string, antwoord: string): Opgave => ({
  id: `opgave-${nummer}`,
  type: "kaal",
  vraag: berekening.split("=")[0].trim() + " =",
  antwoord,
  berekening,
  context: null,
  illustrationDescription: null,
});

const werkblad = (opgaven: Opgave[]): WerkbladResultaat => ({
  titel: "Tafels oefenen",
  doel: "Ik kan tafels tot 10 oefenen.",
  eiland: "aruba",
  taal: "Papiamento",
  leerjaar: 4,
  opgaven,
});

const goedeOpgaven = [
  kaleOpgave(1, "12 + 8 = 20", "20"),
  kaleOpgave(2, "45 - 17 = 28", "28"),
  kaleOpgave(3, "6 × 4 = 24", "24"),
  kaleOpgave(4, "24 ÷ 6 = 4", "4"),
  kaleOpgave(5, "2,5 + 1,5 = 4", "4"),
];

describe("validateWerkbladResultaat", () => {
  it("keurt een correct werkblad goed", () => {
    const uitkomst = validateWerkbladResultaat(werkblad(goedeOpgaven), { instellingen });
    expect(uitkomst).toEqual({ geldig: true, fouten: [] });
  });

  it("meldt een rekenfout met het opgavenummer", () => {
    const opgaven = [...goedeOpgaven];
    opgaven[2] = kaleOpgave(3, "6 × 4 = 25", "25");

    const uitkomst = validateWerkbladResultaat(werkblad(opgaven), { instellingen });

    expect(uitkomst.geldig).toBe(false);
    expect(uitkomst.fouten).toContain(
      "Opgave 3 bevat een onjuiste berekening: 6 × 4 = 25.",
    );
  });

  it("meldt een antwoord dat niet bij de berekening past", () => {
    const opgaven = [...goedeOpgaven];
    opgaven[0] = kaleOpgave(1, "3 × 6 = 18", "19");

    const uitkomst = validateWerkbladResultaat(werkblad(opgaven), { instellingen });

    expect(uitkomst.geldig).toBe(false);
    expect(uitkomst.fouten[0]).toContain('Opgave 1 heeft antwoord "19"');
  });

  it("laat opgaven die niet na te rekenen zijn met rust", () => {
    const opgaven = [...goedeOpgaven];
    opgaven[1] = {
      ...kaleOpgave(2, "de helft van 20 is 10", "10"),
      vraag: "Hoeveel is de helft van 20?",
    };

    const uitkomst = validateWerkbladResultaat(werkblad(opgaven), { instellingen });

    expect(uitkomst.geldig).toBe(true);
  });

  it("blijft de bestaande regels controleren", () => {
    const opgaven = goedeOpgaven.slice(0, 4);
    const uitkomst = validateWerkbladResultaat(werkblad(opgaven), { instellingen });

    expect(uitkomst.geldig).toBe(false);
    expect(uitkomst.fouten[0]).toContain("4 opgaven gegenereerd in plaats van 5");
  });
});
