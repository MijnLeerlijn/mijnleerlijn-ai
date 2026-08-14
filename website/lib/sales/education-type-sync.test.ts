import { describe, it, expect, vi } from "vitest";
import type { Payload } from "payload";
import { vindVariantVoorTypeSchool, haalVariantenVoorTypeSchoolMapping } from "./education-type-sync";

describe("vindVariantVoorTypeSchool", () => {
  const varianten = [
    { id: 1, educationType: "montessori" },
    { id: 2, educationType: "algemeen" },
  ];

  it("matcht een Monday-label case-insensitief tegen variants.educationType", () => {
    expect(vindVariantVoorTypeSchool("Montessori", varianten)).toEqual({ status: "gematcht", variantId: 1 });
  });

  it("matcht ook wanneer de casing exact gelijk is", () => {
    expect(vindVariantVoorTypeSchool("algemeen", varianten)).toEqual({ status: "gematcht", variantId: 2 });
  });

  it("geeft 'onbekend' terug voor een Monday-label zonder matchende variant — verzint NOOIT een variant-ID", () => {
    expect(vindVariantVoorTypeSchool("Domein onderwijs", varianten)).toEqual({ status: "onbekend", mondayLabel: "Domein onderwijs" });
  });

  it("geeft 'onbekend' terug voor 'Anders organiseren' zonder matchende variant", () => {
    expect(vindVariantVoorTypeSchool("Anders organiseren", varianten)).toEqual({ status: "onbekend", mondayLabel: "Anders organiseren" });
  });

  it("geeft 'leeg' terug voor null", () => {
    expect(vindVariantVoorTypeSchool(null, varianten)).toEqual({ status: "leeg" });
  });

  it("geeft 'leeg' terug voor een lege/whitespace-only string", () => {
    expect(vindVariantVoorTypeSchool("   ", varianten)).toEqual({ status: "leeg" });
  });

  it("trimt whitespace vóór het vergelijken", () => {
    expect(vindVariantVoorTypeSchool("  Montessori  ", varianten)).toEqual({ status: "gematcht", variantId: 1 });
  });

  it("geeft 'onbekend' terug wanneer er nog helemaal geen variants bestaan", () => {
    expect(vindVariantVoorTypeSchool("Montessori", [])).toEqual({ status: "onbekend", mondayLabel: "Montessori" });
  });
});

describe("haalVariantenVoorTypeSchoolMapping", () => {
  it("haalt id + educationType op van alle variants", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 1, educationType: "montessori", name: "MijnMonti" }] });
    const payload = { find } as unknown as Payload;

    const resultaat = await haalVariantenVoorTypeSchoolMapping(payload);

    expect(resultaat).toEqual([{ id: 1, educationType: "montessori" }]);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: "variants", overrideAccess: true }));
  });
});
