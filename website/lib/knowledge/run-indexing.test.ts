import { describe, it, expect, vi, beforeEach } from "vitest";
import { runKnowledgeIndexing, STANDAARD_LIMIET } from "./run-indexing";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { processKnowledgeSource } from "./process-source";

vi.mock("./process-source", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./process-source")>();
  return { ...echt, processKnowledgeSource: vi.fn() };
});
const mockProcess = vi.mocked(processKnowledgeSource);

function maakBronDoc(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Bron ${id}`,
    type: "website",
    url: "https://mijnleerlijn.nl",
    status: "new",
    createdAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockProcess.mockReset();
});

describe("runKnowledgeIndexing — selectie", () => {
  it("kiest zonder expliciete sourceIds automatisch tot STANDAARD_LIMIET nog niet (succesvol) geïndexeerde bronnen", async () => {
    mockProcess.mockResolvedValue({ type: "indexed" });
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        maakBronDoc(1, { status: "indexed" }),
        ...Array.from({ length: 8 }, (_, i) => maakBronDoc(100 + i)),
      ],
    });

    await runKnowledgeIndexing(payload, {});

    expect(mockProcess).toHaveBeenCalledTimes(STANDAARD_LIMIET);
  });

  it("verwerkt met expliciete sourceIds precies die selectie, ongeacht status", async () => {
    mockProcess.mockResolvedValue({ type: "indexed" });
    const { payload } = maakFakePayload({
      "knowledge-sources": [maakBronDoc(1, { status: "indexed" }), maakBronDoc(2)],
    });

    await runKnowledgeIndexing(payload, { sourceIds: [1, 2] });

    expect(mockProcess).toHaveBeenCalledTimes(2);
  });

  it("herindexeert een reeds geïndexeerde bron gewoon opnieuw wanneer expliciet geselecteerd", async () => {
    mockProcess.mockResolvedValue({ type: "indexed" });
    const { payload } = maakFakePayload({
      "knowledge-sources": [maakBronDoc(1, { status: "indexed", aiSummary: "Oude samenvatting" })],
    });

    const samenvatting = await runKnowledgeIndexing(payload, { sourceIds: [1] });

    expect(mockProcess).toHaveBeenCalledTimes(1);
    expect(samenvatting.geindexeerd).toBe(1);
  });

  it("begrenst een expliciete sourceIds-selectie op de harde veiligheidscap (25)", async () => {
    mockProcess.mockResolvedValue({ type: "indexed" });
    const docs = Array.from({ length: 30 }, (_, i) => maakBronDoc(i + 1));
    const { payload } = maakFakePayload({ "knowledge-sources": docs });

    await runKnowledgeIndexing(payload, { sourceIds: docs.map((d) => d.id) });

    expect(mockProcess).toHaveBeenCalledTimes(25);
  });
});

describe("runKnowledgeIndexing — statusovergangen", () => {
  it("telt een succesvolle indexering mee en laat de status op 'indexed' staan (gezet door process-source.ts)", async () => {
    mockProcess.mockImplementation(async (payload, bron) => {
      await payload.update({
        collection: "knowledge-sources",
        id: bron.id,
        overrideAccess: true,
        data: { status: "indexed" },
      });
      return { type: "indexed" };
    });
    const { payload, collection } = maakFakePayload({ "knowledge-sources": [maakBronDoc(1)] });

    const samenvatting = await runKnowledgeIndexing(payload, { sourceIds: [1] });

    expect(samenvatting.geindexeerd).toBe(1);
    expect(collection("knowledge-sources")[0]!.status).toBe("indexed");
  });

  it("telt een mislukte indexering mee, zonder de ronde te stoppen", async () => {
    mockProcess.mockResolvedValue({ type: "failed", foutmelding: "PDF bevat geen leesbare tekst." });
    const { payload } = maakFakePayload({ "knowledge-sources": [maakBronDoc(1)] });

    const samenvatting = await runKnowledgeIndexing(payload, { sourceIds: [1] });

    expect(samenvatting.mislukt).toBe(1);
    expect(samenvatting.fouten[0]).toContain("PDF bevat geen leesbare tekst.");
  });

  it("vangt een onverwachte fout in processKnowledgeSource op en zet de bron op 'error', zonder de ronde te stoppen", async () => {
    mockProcess
      .mockRejectedValueOnce(new Error("onverwachte crash"))
      .mockResolvedValueOnce({ type: "indexed" });
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [maakBronDoc(1), maakBronDoc(2)],
    });

    const samenvatting = await runKnowledgeIndexing(payload, { sourceIds: [1, 2] });

    expect(samenvatting.mislukt).toBe(1);
    expect(samenvatting.geindexeerd).toBe(1);
    expect(collection("knowledge-sources").find((b) => b.id === 1)?.status).toBe("error");
  });
});
