import { describe, it, expect } from "vitest";
import { WERK_BRON_KLEUR, WERK_BRON_LABEL, werkBronItemKlasse, type KaartBron } from "./bron-stijl";

const BRONNEN: KaartBron[] = ["agenda", "mail", "sales", "taak"];

describe("bron-stijl — centrale bronkleurmapping (Mijn Dag productiecorrectie 2026-08-18, punt 4)", () => {
  it("kent elke bron exact één kleur en label toe", () => {
    for (const bron of BRONNEN) {
      expect(WERK_BRON_KLEUR[bron]).toBeTruthy();
      expect(WERK_BRON_LABEL[bron]).toBeTruthy();
    }
  });

  it("volgt de opdrachtseis exact: Agenda=groen, Gmail=paars, Sales=blauw, Taak=oranje", () => {
    expect(WERK_BRON_KLEUR.agenda).toBe("green");
    expect(WERK_BRON_KLEUR.mail).toBe("purple");
    expect(WERK_BRON_KLEUR.sales).toBe("blue");
    expect(WERK_BRON_KLEUR.taak).toBe("orange");
  });

  it("werkBronItemKlasse geeft een stabiele, voorspelbare CSS-klassenaam per bron", () => {
    expect(werkBronItemKlasse("mail")).toBe("ml-sales-widget__item--bron-mail");
    expect(werkBronItemKlasse("agenda")).toBe("ml-sales-widget__item--bron-agenda");
  });
});
