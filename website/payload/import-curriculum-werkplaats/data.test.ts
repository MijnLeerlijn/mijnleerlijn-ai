import { describe, it, expect } from "vitest";
import { slugify } from "@/utils/slugify";
import { handleiding, kennisartikelen } from "./data";

// Curriculum Werkplaats linkt vanuit twee schermen rechtstreeks naar een
// anker binnen deze handleiding (zie lib/helpdesk-links.ts in de Curriculum
// Werkplaats-codebase: #10-een-doel-splitsen en
// #18-exporteren-naar-mijnleerlijn). Die ankers zijn de sectietitel hier
// door dezelfde slugify()-functie die de artikelpagina zelf gebruikt (zie
// app/(frontend)/(public)/artikel/[slug]/page.tsx). Deze test bewaakt dat
// een latere hernummering/hertitelt van die twee secties niet stilzwijgend
// een dode link aan de Curriculum-kant achterlaat.
describe("Curriculum Werkplaats-content — structuur en cross-app deep-links", () => {
  it("bevat geen dubbele slugs tussen de handleiding en de kennisartikelen", () => {
    const alleSlugs = [handleiding.slug, ...kennisartikelen.map((a) => a.slug)];
    expect(new Set(alleSlugs).size).toBe(alleSlugs.length);
  });

  it("bevat precies 18 losse kennisartikelen (punt 13 van de opdracht)", () => {
    expect(kennisartikelen).toHaveLength(18);
  });

  it("elke sectie en elk blok heeft niet-lege inhoud", () => {
    for (const artikel of [handleiding, ...kennisartikelen]) {
      expect(artikel.sections.length).toBeGreaterThan(0);
      for (const sectie of artikel.sections) {
        expect(sectie.title.trim()).not.toBe("");
        expect(sectie.blocks.length).toBeGreaterThan(0);
        for (const block of sectie.blocks) {
          expect(block.body.trim()).not.toBe("");
        }
      }
    }
  });

  it("sectie 10 ('doel splitsen') slugify't naar het anker dat Curriculum Werkplaats gebruikt", () => {
    const sectie = handleiding.sections.find((s) => s.title.startsWith("10."));
    expect(sectie).toBeDefined();
    expect(slugify(sectie!.title)).toBe("10-een-doel-splitsen");
  });

  it("sectie 18 ('exporteren naar MijnLeerlijn') slugify't naar het anker dat Curriculum Werkplaats gebruikt", () => {
    const sectie = handleiding.sections.find((s) => s.title.startsWith("18."));
    expect(sectie).toBeDefined();
    expect(slugify(sectie!.title)).toBe("18-exporteren-naar-mijnleerlijn");
  });
});
