import { describe, it, expect } from "vitest";
import type { Field } from "payload";
import { KnowledgeSources } from "./KnowledgeSources";

// Puur config-niveau (geen Payload-runtime/database nodig): controleert dat
// het prioriteitsveld precies bestaat zoals bedoeld — verplicht, default
// "core" (zodat bestaande bronnen automatisch als kerninhoud blijven
// werken), met exact de drie prioriteitsniveaus. Zie de migratie
// payload/migrations/20260724_122940_add_knowledge_source_priority.ts voor
// de bijbehorende, idempotente kolomtoevoeging met dezelfde default.

function veldByNaam(naam: string): Field {
  const veld = KnowledgeSources.fields.find((f) => "name" in f && f.name === naam);
  if (!veld) throw new Error(`Veld "${naam}" niet gevonden op KnowledgeSources`);
  return veld;
}

describe("KnowledgeSources — veld 'priority'", () => {
  it("is een verplicht selectveld met default 'core'", () => {
    const veld = veldByNaam("priority") as Extract<Field, { type: "select" }>;

    expect(veld.type).toBe("select");
    expect(veld.required).toBe(true);
    expect(veld.defaultValue).toBe("core");
    expect(veld.label).toBe("Prioriteit");
  });

  it("biedt exact de drie prioriteitsniveaus (core/secondary/reference)", () => {
    const veld = veldByNaam("priority") as Extract<Field, { type: "select" }>;

    expect(veld.options).toEqual([
      { label: "Kerninhoud", value: "core" },
      { label: "Aanvullende inhoud", value: "secondary" },
      { label: "Achtergrondinformatie", value: "reference" },
    ]);
  });

  it("is zichtbaar/bewerkbaar in de admin-UI (geen readOnly/hidden, in tegenstelling tot de AI-systeemvelden)", () => {
    const veld = veldByNaam("priority") as Extract<Field, { type: "select" }>;

    expect(veld.admin?.readOnly).not.toBe(true);
    expect(veld.admin?.hidden).not.toBe(true);
  });
});
