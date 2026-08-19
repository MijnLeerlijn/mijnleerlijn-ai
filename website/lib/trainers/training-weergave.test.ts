import { describe, it, expect } from "vitest";
import { bepaalWeergaveStatus, groepeerOpWeergaveStatus } from "./training-weergave";
import type { TrainingStatus } from "./monday-links";

const VANDAAG = "2026-08-20";

function training(opts: { status: TrainingStatus; datum: string | null; logboekIngevuld?: boolean }) {
  return { status: opts.status, datum: opts.datum, logboekIngevuld: opts.logboekIngevuld ?? false };
}

describe("bepaalWeergaveStatus", () => {
  it("geen datum + status open -> open", () => {
    expect(bepaalWeergaveStatus(training({ status: "open", datum: null }), VANDAAG)).toBe("open");
  });

  it("geen datum + status gepland (datakwaliteitsuitzondering, geen echte contradictie verwacht) -> open, geen datum is leidend", () => {
    expect(bepaalWeergaveStatus(training({ status: "gepland", datum: null }), VANDAAG)).toBe("open");
  });

  it("geen datum + status gedaan (handmatig gezet zonder datum) -> gedaan", () => {
    expect(bepaalWeergaveStatus(training({ status: "gedaan", datum: null }), VANDAAG)).toBe("gedaan");
  });

  it("datum in de toekomst -> komend", () => {
    expect(bepaalWeergaveStatus(training({ status: "gepland", datum: "2026-09-01" }), VANDAAG)).toBe("komend");
  });

  it("datum vandaag + logboek ingevuld -> vandaag", () => {
    expect(bepaalWeergaveStatus(training({ status: "gepland", datum: VANDAAG, logboekIngevuld: true }), VANDAAG)).toBe("vandaag");
  });

  it("datum vandaag + logboek NIET ingevuld -> verslag_nog_invullen (wint van 'vandaag')", () => {
    expect(bepaalWeergaveStatus(training({ status: "gepland", datum: VANDAAG, logboekIngevuld: false }), VANDAAG)).toBe(
      "verslag_nog_invullen"
    );
  });

  it("datum verstreken + logboek niet ingevuld -> verslag_nog_invullen", () => {
    expect(bepaalWeergaveStatus(training({ status: "gepland", datum: "2026-08-10", logboekIngevuld: false }), VANDAAG)).toBe(
      "verslag_nog_invullen"
    );
  });

  it("KRITIEK: verstreken + status al 'gedaan' + logboek niet ingevuld -> blijft verslag_nog_invullen (vergeten statusovergang mag training nooit laten verdwijnen)", () => {
    expect(bepaalWeergaveStatus(training({ status: "gedaan", datum: "2026-08-10", logboekIngevuld: false }), VANDAAG)).toBe(
      "verslag_nog_invullen"
    );
  });

  it("datum verstreken + logboek ingevuld -> gedaan", () => {
    expect(bepaalWeergaveStatus(training({ status: "gepland", datum: "2026-08-10", logboekIngevuld: true }), VANDAAG)).toBe("gedaan");
  });

  it("geannuleerd wint altijd, ook met een verstreken datum en logboek niet ingevuld (nooit een verslagprompt)", () => {
    expect(bepaalWeergaveStatus(training({ status: "geannuleerd", datum: "2026-08-10", logboekIngevuld: false }), VANDAAG)).toBe(
      "geannuleerd"
    );
  });

  it("geannuleerd wint altijd, ook zonder datum", () => {
    expect(bepaalWeergaveStatus(training({ status: "geannuleerd", datum: null }), VANDAAG)).toBe("geannuleerd");
  });

  it("geannuleerd wint altijd, ook met een datum vandaag", () => {
    expect(bepaalWeergaveStatus(training({ status: "geannuleerd", datum: VANDAAG, logboekIngevuld: false }), VANDAAG)).toBe(
      "geannuleerd"
    );
  });
});

describe("groepeerOpWeergaveStatus", () => {
  it("verdeelt een gemengde lijst correct over alle 6 buckets, telkens leeg initieel aanwezig", () => {
    const trainingen = [
      training({ status: "open", datum: null }),
      training({ status: "gepland", datum: VANDAAG, logboekIngevuld: true }),
      training({ status: "gepland", datum: "2026-09-01" }),
      training({ status: "gepland", datum: "2026-08-10", logboekIngevuld: false }),
      training({ status: "gepland", datum: "2026-08-10", logboekIngevuld: true }),
      training({ status: "geannuleerd", datum: "2026-08-10", logboekIngevuld: false }),
    ];
    const groepen = groepeerOpWeergaveStatus(trainingen, VANDAAG);
    expect(groepen.open).toHaveLength(1);
    expect(groepen.vandaag).toHaveLength(1);
    expect(groepen.komend).toHaveLength(1);
    expect(groepen.verslag_nog_invullen).toHaveLength(1);
    expect(groepen.gedaan).toHaveLength(1);
    expect(groepen.geannuleerd).toHaveLength(1);
  });

  it("lege invoer -> alle 6 buckets leeg, geen undefined/ontbrekende sleutels", () => {
    const groepen = groepeerOpWeergaveStatus([], VANDAAG);
    expect(Object.keys(groepen).sort()).toEqual(["gedaan", "geannuleerd", "komend", "open", "vandaag", "verslag_nog_invullen"].sort());
    for (const bucket of Object.values(groepen)) expect(bucket).toEqual([]);
  });
});
