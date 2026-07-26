import { describe, it, expect } from "vitest";
import { bepaalPublicatieVelden } from "./handleiding-publicatie";

const VASTE_TIJD = "2026-07-26T12:00:00.000Z";
const nu = () => VASTE_TIJD;

describe("bepaalPublicatieVelden", () => {
  it("hoogt versie op en zet gepubliceerdOp/gepubliceerdDoor bij de ECHTE overgang concept -> gepubliceerd", () => {
    const uitkomst = bepaalPublicatieVelden({
      huidigeStatus: "gepubliceerd",
      vorigeStatus: "concept",
      vorigeVersie: 1,
      gebruikerId: 42,
      nu,
    });

    expect(uitkomst).toEqual({ versie: 2, gepubliceerdOp: VASTE_TIJD, gepubliceerdDoor: 42 });
  });

  it("doet niets wanneer de handleiding AL gepubliceerd was (gewone bewerking, geen nieuwe publicatie)", () => {
    const uitkomst = bepaalPublicatieVelden({
      huidigeStatus: "gepubliceerd",
      vorigeStatus: "gepubliceerd",
      vorigeVersie: 3,
      gebruikerId: 42,
      nu,
    });

    expect(uitkomst).toEqual({});
  });

  it("doet niets bij het aanmaken vanuit concept, ook niet zonder eerdere status (nieuw document)", () => {
    const uitkomst = bepaalPublicatieVelden({
      huidigeStatus: "concept",
      vorigeStatus: undefined,
      vorigeVersie: undefined,
      gebruikerId: 42,
      nu,
    });

    expect(uitkomst).toEqual({});
  });

  it("doet niets bij een overgang WEG van gepubliceerd (uit publicatie halen)", () => {
    const uitkomst = bepaalPublicatieVelden({
      huidigeStatus: "gearchiveerd",
      vorigeStatus: "gepubliceerd",
      vorigeVersie: 2,
      gebruikerId: 42,
      nu,
    });

    expect(uitkomst).toEqual({});
  });

  it("begint bij versie 1 wanneer er nog geen eerdere versie was (eerste publicatie ooit)", () => {
    const uitkomst = bepaalPublicatieVelden({
      huidigeStatus: "gepubliceerd",
      vorigeStatus: "concept",
      vorigeVersie: null,
      gebruikerId: 1,
      nu,
    });

    expect(uitkomst.versie).toBe(1);
  });

  it("zet gepubliceerdDoor niet wanneer er geen ingelogde gebruiker bekend is", () => {
    const uitkomst = bepaalPublicatieVelden({
      huidigeStatus: "gepubliceerd",
      vorigeStatus: "concept",
      vorigeVersie: 0,
      gebruikerId: null,
      nu,
    });

    expect(uitkomst.gepubliceerdDoor).toBeUndefined();
    expect(uitkomst.versie).toBe(1);
  });

  it("hoogt versie opnieuw op bij een herpublicatie (gearchiveerd -> gepubliceerd)", () => {
    const uitkomst = bepaalPublicatieVelden({
      huidigeStatus: "gepubliceerd",
      vorigeStatus: "gearchiveerd",
      vorigeVersie: 2,
      gebruikerId: 7,
      nu,
    });

    expect(uitkomst.versie).toBe(3);
  });
});
