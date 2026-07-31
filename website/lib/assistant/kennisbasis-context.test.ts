import { describe, it, expect, vi } from "vitest";
import type { Payload } from "payload";
import { haalAchtergrondKennisbasisVoorVariant, isAchtergrondDocument } from "./kennisbasis-context";

function maakPayload(findResultaat: { docs: unknown[] }): Payload {
  return {
    find: vi.fn().mockResolvedValue(findResultaat),
    logger: { warn: vi.fn(), error: vi.fn() },
  } as unknown as Payload;
}

describe("isAchtergrondDocument", () => {
  it("herkent intern_document met lege purpose als achtergronddocument (afgeleide bronrol)", () => {
    expect(isAchtergrondDocument({ type: "intern_document", purpose: null })).toBe(true);
  });

  it("herkent purpose=background-model ongeacht type", () => {
    expect(isAchtergrondDocument({ type: "pdf", purpose: "background-model" })).toBe(true);
  });

  it("wijst een handleiding-pdf zonder expliciete purpose af", () => {
    expect(isAchtergrondDocument({ type: "pdf", purpose: null })).toBe(false);
  });
});

describe("haalAchtergrondKennisbasisVoorVariant", () => {
  it("geeft tekst + versie + knowledgeSourceId terug voor het gevonden achtergronddocument", async () => {
    const payload = maakPayload({
      docs: [{ id: 42, type: "intern_document", purpose: null, content: "De achtergrondtekst.", updatedAt: "2026-07-31T10:00:00.000Z" }],
    });

    const resultaat = await haalAchtergrondKennisbasisVoorVariant(payload, 1);

    expect(resultaat).toEqual({ tekst: "De achtergrondtekst.", versie: "2026-07-31T10:00:00.000Z", knowledgeSourceId: 42 });
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "knowledge-sources", where: { variantContext: { equals: 1 } } })
    );
  });

  it("geeft null terug en logt een waarschuwing wanneer de variant geen achtergronddocument heeft — nooit een terugval", async () => {
    const payload = maakPayload({ docs: [] });

    const resultaat = await haalAchtergrondKennisbasisVoorVariant(payload, 2);

    expect(resultaat).toBeNull();
    expect(payload.logger.warn).toHaveBeenCalledWith(expect.stringContaining("geen achtergronddocument"));
  });

  it("negeert kandidaten die geen achtergrond-bronrol hebben (bv. een gewone handleiding met dezelfde variantContext)", async () => {
    const payload = maakPayload({
      docs: [{ id: 1, type: "pdf", purpose: null, content: "Handleidingtekst" }],
    });

    const resultaat = await haalAchtergrondKennisbasisVoorVariant(payload, 3);

    expect(resultaat).toBeNull();
  });

  it("geeft null terug wanneer het gevonden document leeg is (nog niet ingevuld)", async () => {
    const payload = maakPayload({
      docs: [{ id: 5, type: "intern_document", purpose: null, content: "   ", updatedAt: "2026-07-31T00:00:00.000Z" }],
    });

    const resultaat = await haalAchtergrondKennisbasisVoorVariant(payload, 4);

    expect(resultaat).toBeNull();
    expect(payload.logger.warn).toHaveBeenCalledWith(expect.stringContaining("is leeg"));
  });

  it("kiest bij meerdere kandidaten (dataconsistentiefout) de meest recent bijgewerkte en logt een waarschuwing", async () => {
    const payload = maakPayload({
      docs: [
        { id: 1, type: "intern_document", purpose: null, content: "oud", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: 2, type: "intern_document", purpose: null, content: "nieuw", updatedAt: "2026-07-31T00:00:00.000Z" },
      ],
    });

    const resultaat = await haalAchtergrondKennisbasisVoorVariant(payload, 5);

    expect(resultaat?.knowledgeSourceId).toBe(2);
    expect(resultaat?.tekst).toBe("nieuw");
    expect(payload.logger.warn).toHaveBeenCalledWith(expect.stringContaining("2 achtergronddocumenten"));
  });

  it("faalt nooit hard: geeft null terug bij een databasefout", async () => {
    const payload = {
      find: vi.fn().mockRejectedValue(new Error("db weg")),
      logger: { warn: vi.fn(), error: vi.fn() },
    } as unknown as Payload;

    expect(await haalAchtergrondKennisbasisVoorVariant(payload, 6)).toBeNull();
    expect(payload.logger.error).toHaveBeenCalled();
  });
});
