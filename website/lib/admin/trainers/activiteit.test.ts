import { describe, it, expect } from "vitest";
import { bouwAdminActiviteitFeed } from "./activiteit";
import type { AdminVerslagActiviteit, AdminLogboekItem, AdminMislukteTelefonieOproep, AdminTrainerAccount } from "./aggregatie";

// Traineromgeving V2, Fase 4 (2026-08-24) — spec §6/§18: "chronologische feed
// uit bestaande bronnen... geen technische auditnoise." Telefonie mag alleen
// bij een betekenisvolle status (hier: definitief mislukt) meedoen — een
// geslaagde ingesproken oproep zit al in de verslagen-tak.

function trainer(overrides: Partial<AdminTrainerAccount> = {}): AdminTrainerAccount {
  return { id: 1, naam: "Anne Trainer", email: "anne@mijnleerlijn.test", actief: true, mondayUitvoerderItemId: "uitv-1", mondayTrainerboardId: "board-1", telefonieActief: false, ...overrides };
}

function verslag(overrides: Partial<AdminVerslagActiviteit> = {}): AdminVerslagActiviteit {
  return {
    verslagId: 1,
    trainerId: 1,
    mondayTrainingId: "t1",
    schoolId: "school-1",
    schoolNaam: "School Een",
    trainingNaam: "Training 1",
    bron: "portal",
    status: "voltooid",
    wanneer: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function logboekItem(overrides: Partial<AdminLogboekItem> = {}): AdminLogboekItem {
  return {
    id: 1,
    trainerId: 1,
    mondaySchoolId: "school-1",
    schoolNaam: "School Een",
    type: "notitie",
    occurredAt: "2026-08-19T00:00:00.000Z",
    tekst: "Even gebeld met de directeur over de planning volgende maand.",
    mondayTrainingId: null,
    trainingNaam: null,
    createdAt: "2026-08-19T00:05:00.000Z",
    ...overrides,
  };
}

function misluktOproep(overrides: Partial<AdminMislukteTelefonieOproep> = {}): AdminMislukteTelefonieOproep {
  return {
    oproepId: 1,
    trainerId: 1,
    foutcode: "transcriptie_mislukt",
    foutmelding: "Max. pogingen bereikt",
    afgerondOp: "2026-08-18T00:00:00.000Z",
    gekozenSchoolNaam: "School Een",
    gekozenTrainingNaam: "Training 1",
    ...overrides,
  };
}

describe("bouwAdminActiviteitFeed", () => {
  it("labelt bron=telefoon als 'telefonisch', bron=portal als 'training'", () => {
    const feed = bouwAdminActiviteitFeed([verslag({ bron: "telefoon" }), verslag({ verslagId: 2, mondayTrainingId: "t2", bron: "portal" })], [], [], [trainer()], 10);
    expect(feed.map((i) => i.soort).sort()).toEqual(["telefonisch", "training"]);
  });

  it("gebruikt bij een logboekitem zonder training de korte tekstpreview als titel", () => {
    const feed = bouwAdminActiviteitFeed([], [logboekItem()], [], [trainer()], 10);
    expect(feed[0]?.titel).toContain("Even gebeld met de directeur");
  });

  it("gebruikt bij een logboekitem MET gekoppelde training de trainingnaam als titel", () => {
    const feed = bouwAdminActiviteitFeed([], [logboekItem({ trainingNaam: "Rekentraining groep 5" })], [], [trainer()], 10);
    expect(feed[0]?.titel).toBe("Rekentraining groep 5");
  });

  it("neemt een mislukte telefonie-oproep op als 'telefonie_mislukt'", () => {
    const feed = bouwAdminActiviteitFeed([], [], [misluktOproep()], [trainer()], 10);
    expect(feed[0]?.soort).toBe("telefonie_mislukt");
  });

  it("negeert een mislukte oproep zonder gekoppelde trainer (nooit-geïdentificeerd nummer)", () => {
    const feed = bouwAdminActiviteitFeed([], [], [misluktOproep({ trainerId: null })], [trainer()], 10);
    expect(feed).toHaveLength(0);
  });

  it("sorteert alle bronnen samen chronologisch, meest recent eerst", () => {
    const feed = bouwAdminActiviteitFeed(
      [verslag({ wanneer: "2026-08-20T00:00:00.000Z" })],
      [logboekItem({ occurredAt: "2026-08-22T00:00:00.000Z" })],
      [misluktOproep({ afgerondOp: "2026-08-21T00:00:00.000Z" })],
      [trainer()],
      10
    );
    expect(feed.map((i) => i.soort)).toEqual(["notitie", "telefonie_mislukt", "training"]);
  });

  it("respecteert de limiet ná het samenvoegen van alle bronnen", () => {
    const verslagen = Array.from({ length: 5 }, (_, i) => verslag({ verslagId: i, mondayTrainingId: `t${i}`, wanneer: `2026-08-${10 + i}T00:00:00.000Z` }));
    const feed = bouwAdminActiviteitFeed(verslagen, [], [], [trainer()], 2);
    expect(feed).toHaveLength(2);
    // De twee MEEST RECENTE (hoogste dag) moeten overblijven.
    expect(feed[0]?.wanneer.startsWith("2026-08-14")).toBe(true);
    expect(feed[1]?.wanneer.startsWith("2026-08-13")).toBe(true);
  });

  it("koppelt trainerNaam via de trainerlijst, met een nette fallback bij een onbekend trainerId", () => {
    const feed = bouwAdminActiviteitFeed([verslag({ trainerId: 999 })], [], [], [trainer()], 10);
    expect(feed[0]?.trainerNaam).toBe("Onbekende trainer");
  });
});
