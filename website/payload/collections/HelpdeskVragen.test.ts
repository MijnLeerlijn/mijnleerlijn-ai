import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "payload";
import { vulVraagNormalizedIn } from "./HelpdeskVragen";

const mockFind = vi.fn();

function maakReq() {
  return { payload: { find: mockFind } } as never;
}

beforeEach(() => {
  mockFind.mockReset();
  mockFind.mockResolvedValue({ docs: [] });
});

// Bugfix (2026-07-29): "The following field is invalid: Vraag
// (genormaliseerd)" bij handmatig aanmaken/wijzigen via Payload's eigen
// admin-formulier — vraagNormalized werd nooit serverside ingevuld.
describe("vulVraagNormalizedIn", () => {
  it("vult vraagNormalized bij handmatig aanmaken (geen originalDoc)", async () => {
    const data = { vraag: "  Hoe   koppel ik  Doelen?  " };

    const result = await vulVraagNormalizedIn({
      data,
      originalDoc: undefined,
      operation: "create",
      req: maakReq(),
    } as never);

    expect(result.vraagNormalized).toBe("hoe koppel ik doelen?");
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "helpdesk-vragen",
        where: { vraagNormalized: { equals: "hoe koppel ik doelen?" } },
      })
    );
  });

  it("herberekent vraagNormalized wanneer vraag wijzigt bij een update", async () => {
    const data = { vraag: "Nieuwe tekst" };
    const originalDoc = { id: 1, vraag: "Oude tekst", vraagNormalized: "oude tekst" };

    const result = await vulVraagNormalizedIn({
      data,
      originalDoc,
      operation: "update",
      req: maakReq(),
    } as never);

    expect(result.vraagNormalized).toBe("nieuwe tekst");
  });

  it("slaat de duplicaatcontrole over wanneer de genormaliseerde vraag niet verandert (bv. alleen pinned/verborgen wijzigen)", async () => {
    const data = { vraag: "Bestaande vraag", pinned: true };
    const originalDoc = { id: 1, vraag: "Bestaande vraag", vraagNormalized: "bestaande vraag" };

    await vulVraagNormalizedIn({
      data,
      originalDoc,
      operation: "update",
      req: maakReq(),
    } as never);

    expect(mockFind).not.toHaveBeenCalled();
  });

  it("gooit een begrijpelijke ValidationError bij een duplicaat op create", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 99, vraag: "Bestaande vraag" }] });
    const data = { vraag: "bestaande   vraag" };

    await expect(
      vulVraagNormalizedIn({
        data,
        originalDoc: undefined,
        operation: "create",
        req: maakReq(),
      } as never)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("gooit een begrijpelijke ValidationError bij een duplicaat op update naar een ANDER bestaand record", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 99, vraag: "Andere vraag" }] });
    const data = { vraag: "Andere vraag" };
    const originalDoc = { id: 1, vraag: "Deze vraag", vraagNormalized: "deze vraag" };

    await expect(
      vulVraagNormalizedIn({
        data,
        originalDoc,
        operation: "update",
        req: maakReq(),
      } as never)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("flagt een record niet als duplicaat van zichzelf bij een update", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 1, vraag: "Deze vraag" }] });
    const data = { vraag: "Deze Vraag!" };
    const originalDoc = { id: 1, vraag: "Deze vraag", vraagNormalized: "deze vraag!" };

    const result = await vulVraagNormalizedIn({
      data,
      originalDoc,
      operation: "update",
      req: maakReq(),
    } as never);

    expect(result.vraagNormalized).toBe("deze vraag!");
  });

  it("staat dezelfde vraagtekst toe in twee verschillende, niet-overlappende varianten", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 99, vraag: "Bestaande vraag", variantContext: [1] }] });
    const data = { vraag: "Bestaande vraag", variantContext: [2] };

    const result = await vulVraagNormalizedIn({
      data,
      originalDoc: undefined,
      operation: "create",
      req: maakReq(),
    } as never);

    expect(result.vraagNormalized).toBe("bestaande vraag");
  });

  it("gooit een ValidationError bij dezelfde vraagtekst binnen dezelfde (overlappende) variant", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 99, vraag: "Bestaande vraag", variantContext: [1, 2] }] });
    const data = { vraag: "Bestaande vraag", variantContext: [2] };

    await expect(
      vulVraagNormalizedIn({
        data,
        originalDoc: undefined,
        operation: "create",
        req: maakReq(),
      } as never)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("gooit een ValidationError bij twee universele (variantContext-loze) rijen met dezelfde vraagtekst", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 99, vraag: "Bestaande vraag", variantContext: [] }] });
    const data = { vraag: "Bestaande vraag" };

    await expect(
      vulVraagNormalizedIn({
        data,
        originalDoc: undefined,
        operation: "create",
        req: maakReq(),
      } as never)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("laat data ongewijzigd wanneer vraag ontbreekt of leeg is (Payload's eigen required-validatie geeft de fout)", async () => {
    const dataLeeg = { vraag: "   " };

    const result = await vulVraagNormalizedIn({
      data: dataLeeg,
      originalDoc: undefined,
      operation: "create",
      req: maakReq(),
    } as never);

    expect(result.vraagNormalized).toBeUndefined();
    expect(mockFind).not.toHaveBeenCalled();
  });
});
