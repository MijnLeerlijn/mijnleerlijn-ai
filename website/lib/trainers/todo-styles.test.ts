import { describe, it, expect } from "vitest";
import { TODO_CTA_LABEL, TODO_ICOON, todoTijdLabel } from "./todo-styles";
import type { TodoItem } from "./dashboard";

// Vervolgronde (2026-08-22) — gerichte dekking voor "juiste CTA" (opdrachtseis
// testlijst Dashboard): elke To-do-soort moet precies één, herkenbaar
// icoon/CTA-label/tijdlabel opleveren, en de labels moeten overeenkomen met
// de bestaande bewoording elders in de traineromgeving (page.tsx se
// verslagStatusEnActie resp. training-rij.tsx se verslagCta).

const TELEFONISCH_CONCEPT: TodoItem = { soort: "telefonisch_concept", schoolId: "500", schoolNaam: "School A", trainingNaam: "Training A", trainingId: "1", wanneer: "2026-08-20T09:00:00.000Z" };
const VASTGELOPEN: TodoItem = { soort: "verslag_vastgelopen", schoolId: "500", schoolNaam: "School A", trainingNaam: "Training A", trainingId: "2", wanneer: "2026-08-20T09:00:00.000Z", verslagStatus: "bevestigd" };
const GESTART: TodoItem = { soort: "concept_gestart", schoolId: "500", schoolNaam: "School A", trainingNaam: "Training A", trainingId: "3", wanneer: "2026-08-20T09:00:00.000Z" };
const ONTBREEKT: TodoItem = { soort: "verslag_ontbreekt", schoolId: "500", schoolNaam: "School A", trainingNaam: "Training A", trainingId: "4", wanneer: "2026-08-20" };

describe("TODO_CTA_LABEL", () => {
  it("elke soort heeft precies één, correct CTA-label", () => {
    expect(TODO_CTA_LABEL.telefonisch_concept).toBe("Controleren");
    expect(TODO_CTA_LABEL.verslag_vastgelopen).toBe("Verslag afronden");
    expect(TODO_CTA_LABEL.concept_gestart).toBe("Verslag afmaken");
    expect(TODO_CTA_LABEL.verslag_ontbreekt).toBe("Verslag maken");
  });
});

describe("TODO_ICOON", () => {
  it("elke soort heeft een eigen icoon (visueel onderscheid tussen de vier categorieën)", () => {
    const iconen = new Set(Object.values(TODO_ICOON));
    expect(iconen.size).toBe(4);
  });
});

describe("todoTijdLabel", () => {
  it("telefonisch_concept toont 'Ingesproken op ...'", () => {
    expect(todoTijdLabel(TELEFONISCH_CONCEPT)).toMatch(/^Ingesproken op /);
  });

  it("verslag_vastgelopen toont dat de afronding nog niet voltooid is", () => {
    expect(todoTijdLabel(VASTGELOPEN)).toBe("Nog niet volledig verwerkt naar Monday");
  });

  it("concept_gestart toont 'Concept gestart op ...'", () => {
    expect(todoTijdLabel(GESTART)).toMatch(/^Concept gestart op /);
  });

  it("verslag_ontbreekt toont de trainingsdatum", () => {
    expect(todoTijdLabel(ONTBREEKT)).toMatch(/^Training was op /);
  });
});
