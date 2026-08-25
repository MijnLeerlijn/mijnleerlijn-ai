import { describe, it, expect } from "vitest";
import { normaliseerMondayId, bouwActueleTrainingIds, isActueleTraining, bouwActueleTrainingIdsPerTrainer } from "./training-actualiteit";

// Correctieronde Admin Traineromgeving (2026-08-25, spec §1/§3) — dekt de
// gedeelde "actueel geldige training"-whitelist zelf, los van waar hij wordt
// toegepast (dashboard.ts/admin/trainers/todo.ts/aandacht.ts, zie hun eigen
// tests).

describe("normaliseerMondayId", () => {
  it("normaliseert een getal en een string naar dezelfde tekstwaarde — geen fragiele '123' !== 123", () => {
    expect(normaliseerMondayId(123)).toBe("123");
    expect(normaliseerMondayId("123")).toBe("123");
    expect(normaliseerMondayId(123)).toBe(normaliseerMondayId("123"));
  });

  it("trimt witruimte", () => {
    expect(normaliseerMondayId(" 456 ")).toBe("456");
  });
});

describe("bouwActueleTrainingIds / isActueleTraining", () => {
  it("een training uit de meegegeven lijst is actueel", () => {
    const ids = bouwActueleTrainingIds([{ id: "t1" }, { id: "t2" }]);
    expect(isActueleTraining(ids, "t1")).toBe(true);
    expect(isActueleTraining(ids, "t2")).toBe(true);
  });

  it("een training die niet in de lijst voorkomt is niet actueel", () => {
    const ids = bouwActueleTrainingIds([{ id: "t1" }]);
    expect(isActueleTraining(ids, "t-verwijderd")).toBe(false);
  });

  it("een lege trainingenlijst levert een lege whitelist op — niets is actueel", () => {
    const ids = bouwActueleTrainingIds([]);
    expect(isActueleTraining(ids, "t1")).toBe(false);
  });

  it("string/number-typeverschil breekt de match niet (spec: 'geen fragiele === tussen 123 en \"123\"')", () => {
    const ids = bouwActueleTrainingIds([{ id: "123" }]);
    expect(isActueleTraining(ids, 123)).toBe(true);
    expect(isActueleTraining(ids, "123")).toBe(true);
  });
});

describe("bouwActueleTrainingIdsPerTrainer", () => {
  it("bouwt per trainer een eigen whitelist, gekoppeld via mondayUitvoerderItemId", () => {
    const trainers = [
      { id: 1, mondayUitvoerderItemId: "uitv-1" },
      { id: 2, mondayUitvoerderItemId: "uitv-2" },
    ];
    const trainingenPerTrainer = new Map([
      ["uitv-1", [{ id: "t1" }]],
      ["uitv-2", [{ id: "t2" }]],
    ]);
    const map = bouwActueleTrainingIdsPerTrainer(trainers, trainingenPerTrainer);
    expect(isActueleTraining(map.get(1)!, "t1")).toBe(true);
    expect(isActueleTraining(map.get(1)!, "t2")).toBe(false);
    expect(isActueleTraining(map.get(2)!, "t2")).toBe(true);
    expect(isActueleTraining(map.get(2)!, "t1")).toBe(false);
  });

  it("een trainer zonder vermelding in trainingenPerTrainer krijgt een lege whitelist, geen crash", () => {
    const map = bouwActueleTrainingIdsPerTrainer([{ id: 1, mondayUitvoerderItemId: "uitv-1" }], new Map());
    expect(isActueleTraining(map.get(1)!, "t1")).toBe(false);
  });

  it("normaliseert string/number-ID's ook via deze route", () => {
    const map = bouwActueleTrainingIdsPerTrainer([{ id: 1, mondayUitvoerderItemId: "uitv-1" }], new Map([["uitv-1", [{ id: "123" }]]]));
    expect(isActueleTraining(map.get(1)!, 123)).toBe(true);
  });
});
