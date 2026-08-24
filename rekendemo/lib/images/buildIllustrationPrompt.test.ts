import { describe, expect, it } from "vitest";
import { buildIllustrationPrompt } from "./buildIllustrationPrompt";
import { VASTE_STIJLPROMPT } from "./style";

const basis = {
  eiland: "aruba" as const,
  leerjaar: 4 as const,
  illustrationDescription: "Twee kinderen bij een kleine fruitkraam met manden mango's.",
};

describe("buildIllustrationPrompt", () => {
  it("zet de vaste stijl vooraan", () => {
    expect(buildIllustrationPrompt(basis).startsWith(VASTE_STIJLPROMPT)).toBe(true);
  });

  it("neemt de illustratiebeschrijving over", () => {
    expect(buildIllustrationPrompt(basis)).toContain(basis.illustrationDescription);
  });

  it("gebruikt de omgeving van het gekozen eiland", () => {
    expect(buildIllustrationPrompt(basis)).toContain("Aruba");
    expect(buildIllustrationPrompt({ ...basis, eiland: "curacao" })).toContain("Curaçao");
    expect(buildIllustrationPrompt({ ...basis, eiland: "curacao" })).not.toContain(
      "everyday life on Aruba",
    );
  });

  it("leidt een leeftijd af uit het leerjaar", () => {
    expect(buildIllustrationPrompt({ ...basis, leerjaar: 1 })).toContain("6 years old");
    expect(buildIllustrationPrompt({ ...basis, leerjaar: 6 })).toContain("11 years old");
  });

  it("voegt de tekenwens toe als voorkeur, niet als eis", () => {
    const prompt = buildIllustrationPrompt({ ...basis, tekenwens: "een gele luifel" });
    expect(prompt).toContain("een gele luifel");
    expect(prompt).toContain("Preference from the teacher");
  });

  it("laat het wensblok weg als er geen tekenwens is", () => {
    expect(buildIllustrationPrompt({ ...basis, tekenwens: "   " })).not.toContain(
      "Preference from the teacher",
    );
  });

  it("verbiedt tekst, cijfers en toeristische clichés", () => {
    const prompt = buildIllustrationPrompt(basis);
    expect(prompt).toContain("no text");
    expect(prompt).toContain("numbers");
    expect(prompt).toContain("flamingos");
    expect(prompt).toContain("cruise ships");
  });

  it("bevat nooit configuratie of sleutels", () => {
    const prompt = buildIllustrationPrompt({ ...basis, tekenwens: "kinderen" });
    expect(prompt).not.toMatch(/OPENAI|api[_-]?key|sk-/i);
  });
});
