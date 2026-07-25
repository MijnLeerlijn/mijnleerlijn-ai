import { describe, it, expect } from "vitest";
import type { Field, Condition } from "payload";
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

describe("KnowledgeSources — veld 'purpose' (bronrol)", () => {
  it("is een OPTIONEEL selectveld (geen default) met exact de vijf bronrollen", () => {
    const veld = veldByNaam("purpose") as Extract<Field, { type: "select" }>;

    expect(veld.type).toBe("select");
    expect(veld.required).toBeFalsy();
    expect(veld.defaultValue).toBeUndefined();
    expect(veld.options).toEqual([
      { label: "Achtergrondmodel (visie/samenhang)", value: "background-model" },
      { label: "Handleiding (concrete stappen)", value: "manual" },
      { label: "Release note (actuele wijziging)", value: "release-note" },
      { label: "FAQ", value: "faq" },
      { label: "Support (uit supportthreads)", value: "support" },
    ]);
  });
});

describe("KnowledgeSources — veld 'content' (directe inhoud)", () => {
  it("is een textarea, zichtbaar voor alle typen behalve pdf en video", () => {
    const veld = veldByNaam("content") as Extract<Field, { type: "textarea" }>;

    expect(veld.type).toBe("textarea");
    // Derde argument (blockData/operation/path/user) is voor deze conditie
    // niet relevant — runtime-aanroep, vandaar de losse cast i.p.v. het hele
    // Payload-requestcontext te moeten opbouwen.
    const geenContext = {} as Parameters<Condition>[2];
    expect(veld.admin?.condition?.({}, { type: "intern_document" }, geenContext)).toBe(true);
    expect(veld.admin?.condition?.({}, { type: "pdf" }, geenContext)).toBe(false);
    expect(veld.admin?.condition?.({}, { type: "video" }, geenContext)).toBe(false);
  });
});

describe("KnowledgeSources — veld 'variantContext'", () => {
  it("is een optionele hasMany-relatie naar variants (leeg = centraal), zelfde patroon als Articles.ts", () => {
    const veld = veldByNaam("variantContext") as Extract<Field, { type: "relationship" }>;

    expect(veld.type).toBe("relationship");
    expect(veld.relationTo).toBe("variants");
    expect(veld.hasMany).toBe(true);
    expect(veld.required).toBeFalsy();
  });
});
