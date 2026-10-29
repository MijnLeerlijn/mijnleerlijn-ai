import { describe, it, expect } from "vitest";
import { alleItemIds, berekenGroepTelling, toggleGroepInSelectie, toggleItemInSelectie } from "./toegang-menu-logica";
import { NAV_GROUPS } from "@/lib/admin-nav/nav-groups";

// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25).
const training = NAV_GROUPS.find((g) => g.id === "training-begeleiding")!;
const beheer = NAV_GROUPS.find((g) => g.id === "beheer")!;

describe("alleItemIds", () => {
  it("bevat de permissie-ID's van Training & begeleiding, inclusief upsell en startbegeleiding", () => {
    expect(alleItemIds(training)).toEqual([
      "trainers.dashboard",
      "trainers.trainingen",
      "trainers.upsell",
      "trainers.startbegeleiding",
      "trainers.todo",
      "trainers.activiteit",
    ]);
  });

  it("Beheer bevat de verhuisde trainer-ID's én de gemute technische items", () => {
    const ids = alleItemIds(beheer);
    for (const id of ["trainers.accounts", "trainers.telefonie", "trainers.bestanden", "trainers.deelgroepen", "helpdesk-ai.gmail"]) {
      expect(ids).toContain(id);
    }
    expect(ids.length).toBe(beheer.items.length + (beheer.mutedItems?.length ?? 0));
  });
});

describe("berekenGroepTelling", () => {
  it("'alles' is waar wanneer elk item van de groep geselecteerd is", () => {
    const telling = berekenGroepTelling(training, new Set(alleItemIds(training)));
    expect(telling).toEqual({ aantalGeselecteerd: 6, totaal: 6, alles: true, niets: false });
  });

  it("'niets' is waar bij een lege selectie", () => {
    const telling = berekenGroepTelling(training, new Set());
    expect(telling).toEqual({ aantalGeselecteerd: 0, totaal: 6, alles: false, niets: true });
  });

  it("noch 'alles' noch 'niets' is waar bij een gedeeltelijke selectie (indeterminate)", () => {
    const telling = berekenGroepTelling(training, new Set(["trainers.dashboard", "trainers.trainingen"]));
    expect(telling.alles).toBe(false);
    expect(telling.niets).toBe(false);
    expect(telling.aantalGeselecteerd).toBe(2);
  });

  it("selecties uit EEN ANDERE groep tellen niet mee", () => {
    const telling = berekenGroepTelling(training, new Set(["sales.overzicht", "creator.creator"]));
    expect(telling).toEqual({ aantalGeselecteerd: 0, totaal: 6, alles: false, niets: true });
  });
});

describe("toggleItemInSelectie", () => {
  it("voegt een niet-geselecteerd item toe", () => {
    const resultaat = toggleItemInSelectie(new Set(["trainers.dashboard"]), "trainers.todo");
    expect(resultaat).toEqual(new Set(["trainers.dashboard", "trainers.todo"]));
  });

  it("verwijdert een al-geselecteerd item", () => {
    const resultaat = toggleItemInSelectie(new Set(["trainers.dashboard", "trainers.todo"]), "trainers.todo");
    expect(resultaat).toEqual(new Set(["trainers.dashboard"]));
  });

  it("muteert de oorspronkelijke Set niet (onveranderlijk, veilig voor React state)", () => {
    const origineel = new Set(["trainers.dashboard"]);
    toggleItemInSelectie(origineel, "trainers.todo");
    expect(origineel).toEqual(new Set(["trainers.dashboard"]));
  });
});

describe("toggleGroepInSelectie — opdrachtseis §7 'alles selecteren'/'alles uitzetten'", () => {
  it("selecteert alle items van de groep wanneer nog niet alles geselecteerd is (leeg -> alles)", () => {
    const resultaat = toggleGroepInSelectie(new Set(), training);
    expect(resultaat).toEqual(new Set(alleItemIds(training)));
  });

  it("selecteert alle items van de groep wanneer de selectie gedeeltelijk was (deels -> alles)", () => {
    const resultaat = toggleGroepInSelectie(new Set(["trainers.dashboard"]), training);
    expect(resultaat).toEqual(new Set(alleItemIds(training)));
  });

  it("zet alle items van de groep uit wanneer al volledig geselecteerd (alles -> niets)", () => {
    const resultaat = toggleGroepInSelectie(new Set(alleItemIds(training)), training);
    expect(resultaat.size).toBe(0);
  });

  it("laat selecties van EEN ANDERE groep volledig ongemoeid", () => {
    const start = new Set(["sales.overzicht", "trainers.dashboard"]);
    const naAlles = toggleGroepInSelectie(start, training);
    expect(naAlles.has("sales.overzicht")).toBe(true);
    const naNiets = toggleGroepInSelectie(naAlles, training);
    expect(naNiets).toEqual(new Set(["sales.overzicht"]));
  });
});
