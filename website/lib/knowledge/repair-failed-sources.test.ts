import { describe, it, expect, vi, beforeEach } from "vitest";
import { repairFailedKnowledgeSources } from "./repair-failed-sources";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { processKnowledgeSource } from "./process-source";
import { embedKnowledgeSource } from "@/lib/embeddings/process-embedding";

vi.mock("./process-source", () => ({ processKnowledgeSource: vi.fn() }));
vi.mock("@/lib/embeddings/process-embedding", () => ({ embedKnowledgeSource: vi.fn() }));

const mockIndex = vi.mocked(processKnowledgeSource);
const mockEmbed = vi.mocked(embedKnowledgeSource);

function maakMisluktBron(id: number, indexError = "Kon PDF niet ophalen (HTTP 403).") {
  return { id, title: `Bron ${id}`, type: "pdf" as const, file: 100 + id, status: "error", indexError };
}

beforeEach(() => {
  mockIndex.mockReset();
  mockEmbed.mockReset();
  mockIndex.mockResolvedValue({ type: "indexed" });
  mockEmbed.mockResolvedValue({ type: "embedded" });
});

describe("repairFailedKnowledgeSources — vindt en herstelt bronnen met status 'error'", () => {
  it("rapporteert alle mislukte bronnen in 'gevonden' en herstelt ze (herindexeren + herembedden)", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [maakMisluktBron(1), maakMisluktBron(2)],
    });

    const resultaat = await repairFailedKnowledgeSources(payload);

    expect(resultaat.gevonden).toHaveLength(2);
    expect(resultaat.gevonden.map((b) => b.id).sort()).toEqual([1, 2]);
    expect(resultaat.gevonden[0]!.indexError).toContain("403");
    expect(resultaat.verwerkt).toBe(2);
    expect(resultaat.heringedexeerd).toBe(2);
    expect(resultaat.geembed).toBe(2);
    expect(resultaat.nogSteedsMislukt).toBe(0);
    expect(mockIndex).toHaveBeenCalledTimes(2);
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it("negeert bronnen met status 'new', 'indexing' of 'indexed' — alleen 'error' wordt hersteld", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        { id: 1, title: "Nieuw", type: "pdf", status: "new" },
        { id: 2, title: "Bezig", type: "pdf", status: "indexing" },
        { id: 3, title: "Al geïndexeerd", type: "pdf", status: "indexed" },
        maakMisluktBron(4),
      ],
    });

    const resultaat = await repairFailedKnowledgeSources(payload);

    expect(resultaat.gevonden).toHaveLength(1);
    expect(resultaat.gevonden[0]!.id).toBe(4);
    expect(mockIndex).toHaveBeenCalledTimes(1);
  });

  it("respecteert de limiet: 'gevonden' toont alles, maar er wordt niet meer dan de limiet daadwerkelijk verwerkt", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [maakMisluktBron(1), maakMisluktBron(2), maakMisluktBron(3)],
    });

    const resultaat = await repairFailedKnowledgeSources(payload, { limiet: 2 });

    expect(resultaat.gevonden).toHaveLength(3);
    expect(resultaat.verwerkt).toBe(2);
    expect(mockIndex).toHaveBeenCalledTimes(2);
  });

  it("telt een bron die opnieuw mislukt bij het indexeren als 'nogSteedsMislukt', zonder te embedden", async () => {
    mockIndex.mockResolvedValue({ type: "failed", foutmelding: "Kon PDF niet ophalen (HTTP 403)." });
    const { payload } = maakFakePayload({ "knowledge-sources": [maakMisluktBron(1)] });

    const resultaat = await repairFailedKnowledgeSources(payload);

    expect(resultaat.heringedexeerd).toBe(0);
    expect(resultaat.nogSteedsMislukt).toBe(1);
    expect(resultaat.fouten[0]).toContain("403");
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("telt een embeddingfout apart, ook al is de herindexering zelf gelukt", async () => {
    mockEmbed.mockResolvedValue({
      type: "failed",
      foutmelding: "OpenAI: embeddings-eindpunt niet bereikbaar",
    });
    const { payload } = maakFakePayload({ "knowledge-sources": [maakMisluktBron(1)] });

    const resultaat = await repairFailedKnowledgeSources(payload);

    expect(resultaat.heringedexeerd).toBe(1);
    expect(resultaat.geembed).toBe(0);
    expect(resultaat.nogSteedsMislukt).toBe(1);
    expect(resultaat.fouten[0]).toContain("embedden mislukt");
  });

  it("vangt een onverwachte crash tijdens herstellen netjes af en zet de bron terug op 'error'", async () => {
    mockIndex.mockRejectedValue(new Error("Onverwachte netwerkfout"));
    const { payload, collection } = maakFakePayload({ "knowledge-sources": [maakMisluktBron(1)] });

    const resultaat = await repairFailedKnowledgeSources(payload);

    expect(resultaat.nogSteedsMislukt).toBe(1);
    expect(resultaat.fouten[0]).toContain("Onverwachte netwerkfout");
    expect(collection("knowledge-sources")[0]).toMatchObject({ status: "error" });
  });

  it("geeft een lege 'gevonden'-lijst terug wanneer er niets mislukt is", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Prima bron", type: "pdf", status: "indexed" }],
    });

    const resultaat = await repairFailedKnowledgeSources(payload);

    expect(resultaat.gevonden).toEqual([]);
    expect(resultaat.verwerkt).toBe(0);
    expect(mockIndex).not.toHaveBeenCalled();
  });
});
