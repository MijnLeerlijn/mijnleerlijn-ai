import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "payload";
import { maakAutomatischeKennisbron, wijsGereserveerdeSlugAf } from "./Variants";

const mockCreate = vi.fn();
const mockLoggerError = vi.fn();

function maakReq() {
  return { payload: { create: mockCreate, logger: { error: mockLoggerError } } } as never;
}

beforeEach(() => {
  mockCreate.mockReset();
  mockLoggerError.mockReset();
});

// Multi-brand variants (2026-07-30): elke nieuwe variant krijgt automatisch
// een eigen Knowledge Source ("Kennisbasis {productnaam}"), scoped via
// variantContext — zie het technisch ontwerp.
describe("maakAutomatischeKennisbron", () => {
  it("maakt bij create exact één Knowledge Source aan met de juiste titel en variantContext", async () => {
    mockCreate.mockResolvedValue({ id: 99 });

    await maakAutomatischeKennisbron({
      operation: "create",
      doc: { id: 5, name: "MijnMonti", branding: { productName: "MijnMonti" } },
      req: maakReq(),
    } as never);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      collection: "knowledge-sources",
      overrideAccess: true,
      draft: false,
      req: expect.anything(),
      data: {
        title: "Kennisbasis MijnMonti",
        type: "intern_document",
        priority: "core",
        status: "new",
        embeddingStatus: "pending",
        content: "",
        variantContext: [5],
      },
    });
  });

  it("geeft req mee aan de geneste create() zodat deze in dezelfde transactie draait als de variant-aanmaak", async () => {
    mockCreate.mockResolvedValue({ id: 99 });
    const req = maakReq();

    await maakAutomatischeKennisbron({
      operation: "create",
      doc: { id: 5, name: "MijnMonti", branding: { productName: "MijnMonti" } },
      req,
    } as never);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ req }));
  });

  it("valt terug op `name` als branding.productName ontbreekt", async () => {
    mockCreate.mockResolvedValue({ id: 99 });

    await maakAutomatischeKennisbron({
      operation: "create",
      doc: { id: 6, name: "MijnD", branding: {} },
      req: maakReq(),
    } as never);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: "Kennisbasis MijnD" }) })
    );
  });

  it("doet niets bij een update (alleen bij create)", async () => {
    await maakAutomatischeKennisbron({
      operation: "update",
      doc: { id: 5, name: "MijnMonti", branding: { productName: "MijnMonti" } },
      req: maakReq(),
    } as never);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("faalt non-blocking: een fout bij het aanmaken van de kennisbron wordt gelogd, nooit doorgegooid", async () => {
    mockCreate.mockRejectedValue(new Error("DB-fout"));

    await expect(
      maakAutomatischeKennisbron({
        operation: "create",
        doc: { id: 5, name: "MijnMonti", branding: { productName: "MijnMonti" } },
        req: maakReq(),
      } as never)
    ).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });
});

// Dubbele bereikbaarheid (2026-08-11): laag 2 van de bescherming uit
// lib/variant/reserved-slugs.ts (laag 1 is de resolver zelf, zie
// in-memory-variant-resolver.test.ts) — een gereserveerde naam mag nooit als
// variant-slug opgeslagen worden.
describe("wijsGereserveerdeSlugAf", () => {
  it("laat data ongewijzigd bij een niet-gereserveerde slug", () => {
    const data = { slug: "mijnmonti" };

    const result = wijsGereserveerdeSlugAf({ data, req: {} } as never);

    expect(result).toBe(data);
  });

  it("gooit een ValidationError bij een gereserveerde naam (bestaande route)", () => {
    const data = { slug: "contact" };

    expect(() => wijsGereserveerdeSlugAf({ data, req: {} } as never)).toThrow(ValidationError);
  });

  it("gooit een ValidationError bij een gereserveerde naam (infrastructuur)", () => {
    const data = { slug: "curriculum" };

    expect(() => wijsGereserveerdeSlugAf({ data, req: {} } as never)).toThrow(ValidationError);
  });

  it("is hoofdletterongevoelig", () => {
    const data = { slug: "Contact" };

    expect(() => wijsGereserveerdeSlugAf({ data, req: {} } as never)).toThrow(ValidationError);
  });

  it("laat data ongewijzigd wanneer slug ontbreekt (Payload's eigen required-validatie geeft de fout)", () => {
    const data = {};

    const result = wijsGereserveerdeSlugAf({ data, req: {} } as never);

    expect(result).toBe(data);
  });
});
