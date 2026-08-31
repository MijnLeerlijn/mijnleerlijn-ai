import { describe, it, expect } from "vitest";
import { alleItemIds, berekenGroepTelling, toggleGroepInSelectie, toggleItemInSelectie } from "./toegang-menu-logica";
import { NAV_GROUPS } from "@/lib/admin-nav/nav-groups";

// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25).
const trainers = NAV_GROUPS.find((g) => g.id === "trainers")!;
const helpdeskAi = NAV_GROUPS.find((g) => g.id === "helpdesk-ai")!; // heeft mutedItems

describe("alleItemIds", () => {
  it("bevat exact de 9 Trainers-permissie-ID's (8 uit de opdracht + trainers.upsell, Upsell-ronde 2026-09-02)", () => {
    expect(alleItemIds(trainers)).toEqual([
      "trainers.dashboard",
      "trainers.trainingen",
      "trainers.upsell",
      "trainers.todo",
      "trainers.activiteit",
      "trainers.accounts",
      "trainers.telefonie",
      "trainers.bestanden",
      "trainers.deelgroepen",
    ]);
  });

  it("telt ook gemute 'Technisch'-items mee (Helpdesk AI)", () => {
    const ids = alleItemIds(helpdeskAi);
    expect(ids).toContain("helpdesk-ai.gmail"); // muted item
    expect(ids.length).toBe(helpdeskAi.items.length + (helpdeskAi.mutedItems?.length ?? 0));
  });
});

describe("berekenGroepTelling", () => {
  it("'alles' is waar wanneer elk item van de groep geselecteerd is", () => {
    const telling = berekenGroepTelling(trainers, new Set(alleItemIds(trainers)));
    expect(telling).toEqual({ aantalGeselecteerd: 9, totaal: 9, alles: true, niets: false });
  });

  it("'niets' is waar bij een lege selectie", () => {
    const telling = berekenGroepTelling(trainers, new Set());
    expect(telling).toEqual({ aantalGeselecteerd: 0, totaal: 9, alles: false, niets: true });
  });

  it("noch 'alles' noch 'niets' is waar bij een gedeeltelijke selectie (indeterminate)", () => {
    const telling = berekenGroepTelling(trainers, new Set(["trainers.dashboard", "trainers.trainingen"]));
    expect(telling.alles).toBe(false);
    expect(telling.niets).toBe(false);
    expect(telling.aantalGeselecteerd).toBe(2);
  });

  it("selecties uit EEN ANDERE groep tellen niet mee", () => {
    const telling = berekenGroepTelling(trainers, new Set(["sales.overzicht", "creator.creator"]));
    expect(telling).toEqual({ aantalGeselecteerd: 0, totaal: 9, alles: false, niets: true });
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
    const resultaat = toggleGroepInSelectie(new Set(), trainers);
    expect(resultaat).toEqual(new Set(alleItemIds(trainers)));
  });

  it("selecteert alle items van de groep wanneer de selectie gedeeltelijk was (deels -> alles)", () => {
    const resultaat = toggleGroepInSelectie(new Set(["trainers.dashboard"]), trainers);
    expect(resultaat).toEqual(new Set(alleItemIds(trainers)));
  });

  it("zet alle items van de groep uit wanneer al volledig geselecteerd (alles -> niets)", () => {
    const resultaat = toggleGroepInSelectie(new Set(alleItemIds(trainers)), trainers);
    expect(resultaat.size).toBe(0);
  });

  it("laat selecties van EEN ANDERE groep volledig ongemoeid", () => {
    const start = new Set(["sales.overzicht", "trainers.dashboard"]);
    const naAlles = toggleGroepInSelectie(start, trainers);
    expect(naAlles.has("sales.overzicht")).toBe(true);
    const naNiets = toggleGroepInSelectie(naAlles, trainers);
    expect(naNiets).toEqual(new Set(["sales.overzicht"]));
  });
});
