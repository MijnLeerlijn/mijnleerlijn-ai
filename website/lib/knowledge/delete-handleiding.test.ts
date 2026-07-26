import { describe, it, expect, vi } from "vitest";
import { ruimHandleidingMediaOp } from "./delete-handleiding";

function maakPayloadMock(deleteImpl: (...args: unknown[]) => unknown = vi.fn()) {
  return { delete: vi.fn(deleteImpl) } as unknown as Parameters<typeof ruimHandleidingMediaOp>[0];
}

describe("ruimHandleidingMediaOp", () => {
  it("verwijdert het Media-document van elke stapafbeelding, over meerdere stappen heen", async () => {
    const payload = maakPayloadMock();

    const resultaat = await ruimHandleidingMediaOp(payload, {
      stappen: [
        { media: [{ bestand: { id: 1 } }, { bestand: 2 }] },
        { media: [{ bestand: 3 }] },
      ],
    });

    expect(payload.delete).toHaveBeenCalledTimes(3);
    expect(payload.delete).toHaveBeenCalledWith({ collection: "media", id: 1, overrideAccess: true, req: undefined });
    expect(payload.delete).toHaveBeenCalledWith({ collection: "media", id: 2, overrideAccess: true, req: undefined });
    expect(payload.delete).toHaveBeenCalledWith({ collection: "media", id: 3, overrideAccess: true, req: undefined });
    expect(resultaat).toEqual({ mediaVerwijderd: 3, mediaMislukt: 0 });
  });

  it("doet niets bij een handleiding zonder stappen/media", async () => {
    const payload = maakPayloadMock();

    const resultaat = await ruimHandleidingMediaOp(payload, {});

    expect(payload.delete).not.toHaveBeenCalled();
    expect(resultaat).toEqual({ mediaVerwijderd: 0, mediaMislukt: 0 });
  });

  it("slaat een stap zonder media over zonder fout", async () => {
    const payload = maakPayloadMock();

    const resultaat = await ruimHandleidingMediaOp(payload, { stappen: [{}, { media: [] }] });

    expect(payload.delete).not.toHaveBeenCalled();
    expect(resultaat).toEqual({ mediaVerwijderd: 0, mediaMislukt: 0 });
  });

  it("faalt niet hard wanneer een Media-document al verwijderd is", async () => {
    const payload = maakPayloadMock(() => {
      throw new Error("not found");
    });

    const resultaat = await ruimHandleidingMediaOp(payload, { stappen: [{ media: [{ bestand: 1 }] }] });

    expect(resultaat).toEqual({ mediaVerwijderd: 0, mediaMislukt: 1 });
  });

  it("geeft `req` door aan payload.delete (zelfde transactie, voorkomt de deadlock die eerder bij delete-source.ts gevonden is)", async () => {
    const payload = maakPayloadMock();
    const nepReq = { transactionID: "test-tx" } as Parameters<typeof ruimHandleidingMediaOp>[2];

    await ruimHandleidingMediaOp(payload, { stappen: [{ media: [{ bestand: 1 }] }] }, nepReq);

    expect(payload.delete).toHaveBeenCalledWith({ collection: "media", id: 1, overrideAccess: true, req: nepReq });
  });
});
