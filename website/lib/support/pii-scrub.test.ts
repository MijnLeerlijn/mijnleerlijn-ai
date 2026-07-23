import { describe, it, expect } from "vitest";
import { scrubPotentialPii } from "./pii-scrub";

describe("scrubPotentialPii", () => {
  it("verwijdert e-mailadressen", () => {
    expect(scrubPotentialPii("Neem contact op via jan.jansen@school.nl voor meer info.")).toBe(
      "Neem contact op via [e-mailadres verwijderd] voor meer info."
    );
  });

  it("verwijdert Nederlandse telefoonnummers in verschillende notaties", () => {
    expect(scrubPotentialPii("Bel 06-12345678 of 020-1234567.")).toBe(
      "Bel [telefoonnummer verwijderd] of [telefoonnummer verwijderd]."
    );
    expect(scrubPotentialPii("Ook te bereiken op +31 6 12345678.")).toBe(
      "Ook te bereiken op [telefoonnummer verwijderd]."
    );
  });

  it("laat gewone tekst zonder persoonsgegevens ongewijzigd", () => {
    const tekst = "Ga naar Instellingen > Profielen en klik op 'Nieuw profiel toevoegen'.";
    expect(scrubPotentialPii(tekst)).toBe(tekst);
  });

  it("geeft lege/undefined invoer ongewijzigd terug", () => {
    expect(scrubPotentialPii("")).toBe("");
  });
});
