import { describe, it, expect } from "vitest";
import { vindBesteSchoolMatch, matchSchoolBetrouwbaar, type SchoolOptie } from "./school-matching";

const SCHOLEN: SchoolOptie[] = [
  { id: 1, schoolName: "Springplank" },
  { id: 2, schoolName: "De Horizon" },
  { id: 3, schoolName: "Montessorischool De Horizon" },
];

describe("vindBesteSchoolMatch — beste gok, langste match wint", () => {
  it("kiest de langste (meest specifieke) naam bij overlappende matches", () => {
    const match = vindBesteSchoolMatch("Bellen met Montessorischool De Horizon over het voorstel", SCHOLEN);
    expect(match?.id).toBe(3);
  });

  it("levert null zonder enige match", () => {
    expect(vindBesteSchoolMatch("Bellen met een school", SCHOLEN)).toBeNull();
  });

  it("negeert accenten/hoofdletters (genormaliseerde match)", () => {
    const scholen: SchoolOptie[] = [{ id: 9, schoolName: "École Française" }];
    expect(vindBesteSchoolMatch("Bellen met ecole francaise morgen", scholen)?.id).toBe(9);
  });
});

describe("matchSchoolBetrouwbaar — match-of-niets, geen gok bij twijfel", () => {
  it("levert de school bij precies één kandidaat", () => {
    const resultaat = matchSchoolBetrouwbaar("Training bij Springplank", SCHOLEN);
    expect(resultaat.school?.id).toBe(1);
    expect(resultaat.kandidaten).toHaveLength(1);
  });

  it("levert school: null bij twijfel (2+ scholen matchen, bv. een school-naam die in een andere voorkomt)", () => {
    const resultaat = matchSchoolBetrouwbaar("Training bij Montessorischool De Horizon", SCHOLEN);
    expect(resultaat.school).toBeNull();
    expect(resultaat.kandidaten.map((s) => s.id).sort()).toEqual([2, 3]);
  });

  it("levert school: null en een lege kandidatenlijst zonder enige match", () => {
    const resultaat = matchSchoolBetrouwbaar("Training bij een onbekende school", SCHOLEN);
    expect(resultaat.school).toBeNull();
    expect(resultaat.kandidaten).toHaveLength(0);
  });
});
