import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSupportAnalysis, STANDAARD_LIMIET } from "./run-analysis";
import { maakFakePayload } from "./fake-payload";
import { analyseThread } from "./analyze";

vi.mock("./analyze", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./analyze")>();
  return { ...echt, analyseThread: vi.fn() };
});

const mockAnalyseThread = vi.mocked(analyseThread);

function maakThreadDoc(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    subject: `Thread ${id}`,
    messages: [],
    aiAnalysisStatus: "not-analyzed",
    lastMessageAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockAnalyseThread.mockReset();
});

describe("runSupportAnalysis — selectie", () => {
  it("kiest zonder expliciete threadIds automatisch tot STANDAARD_LIMIET nog niet (succesvol) geanalyseerde threads", async () => {
    mockAnalyseThread.mockResolvedValue({ type: "ignored", reden: "test" });
    const { payload } = maakFakePayload({
      "support-threads": [
        maakThreadDoc(1, { aiAnalysisStatus: "analyzed" }),
        ...Array.from({ length: 8 }, (_, i) => maakThreadDoc(100 + i)),
      ],
    });

    await runSupportAnalysis(payload, {});

    expect(mockAnalyseThread).toHaveBeenCalledTimes(STANDAARD_LIMIET);
  });

  it("verwerkt met expliciete threadIds precies die selectie, ongeacht status", async () => {
    mockAnalyseThread.mockResolvedValue({ type: "ignored", reden: "test" });
    const { payload } = maakFakePayload({
      "support-threads": [maakThreadDoc(1, { aiAnalysisStatus: "analyzed" }), maakThreadDoc(2)],
    });

    await runSupportAnalysis(payload, { threadIds: [1, 2] });

    expect(mockAnalyseThread).toHaveBeenCalledTimes(2);
  });

  it("begrenst een expliciete threadIds-selectie op de harde veiligheidscap (25)", async () => {
    mockAnalyseThread.mockResolvedValue({ type: "ignored", reden: "test" });
    const docs = Array.from({ length: 30 }, (_, i) => maakThreadDoc(i + 1));
    const { payload } = maakFakePayload({ "support-threads": docs });

    await runSupportAnalysis(payload, { threadIds: docs.map((d) => d.id) });

    expect(mockAnalyseThread).toHaveBeenCalledTimes(25);
  });
});

describe("runSupportAnalysis — statusovergangen", () => {
  it("zet de thread op 'analyzed' met analyzedAt en gekoppeld concept bij 'created'", async () => {
    mockAnalyseThread.mockResolvedValue({ type: "created", draftId: 42 });
    const { payload, collection } = maakFakePayload({ "support-threads": [maakThreadDoc(1)] });

    const samenvatting = await runSupportAnalysis(payload, { threadIds: [1] });

    expect(samenvatting.conceptenGemaakt).toBe(1);
    const thread = collection("support-threads")[0]!;
    expect(thread.aiAnalysisStatus).toBe("analyzed");
    expect(thread.analyzedAt).toBeTruthy();
    expect(thread.knowledgeDrafts).toEqual([42]);
  });

  it("zet de thread op 'ignored' met de reden in aiAnalysisError", async () => {
    mockAnalyseThread.mockResolvedValue({ type: "ignored", reden: "Te klantspecifiek." });
    const { payload, collection } = maakFakePayload({ "support-threads": [maakThreadDoc(1)] });

    const samenvatting = await runSupportAnalysis(payload, { threadIds: [1] });

    expect(samenvatting.genegeerd).toBe(1);
    const thread = collection("support-threads")[0]!;
    expect(thread.aiAnalysisStatus).toBe("ignored");
    expect(thread.aiAnalysisError).toBe("Te klantspecifiek.");
  });

  it("zet de thread op 'failed' bij een mislukte analyse — nooit op 'analyzed'", async () => {
    mockAnalyseThread.mockResolvedValue({
      type: "failed",
      foutmelding: "AI-analyse mislukt: ongeldige JSON",
    });
    const { payload, collection } = maakFakePayload({ "support-threads": [maakThreadDoc(1)] });

    const samenvatting = await runSupportAnalysis(payload, { threadIds: [1] });

    expect(samenvatting.mislukt).toBe(1);
    const thread = collection("support-threads")[0]!;
    expect(thread.aiAnalysisStatus).toBe("failed");
    expect(thread.aiAnalysisStatus).not.toBe("analyzed");
    expect(thread.aiAnalysisError).toContain("ongeldige JSON");
  });

  it("vangt een onverwachte fout in analyseThread op zonder de hele ronde te laten stoppen", async () => {
    mockAnalyseThread
      .mockRejectedValueOnce(new Error("onverwachte crash"))
      .mockResolvedValueOnce({ type: "ignored", reden: "test" });
    const { payload, collection } = maakFakePayload({
      "support-threads": [maakThreadDoc(1), maakThreadDoc(2)],
    });

    const samenvatting = await runSupportAnalysis(payload, { threadIds: [1, 2] });

    expect(samenvatting.mislukt).toBe(1);
    expect(samenvatting.genegeerd).toBe(1);
    expect(collection("support-threads").find((t) => t.id === 1)?.aiAnalysisStatus).toBe("failed");
    expect(collection("support-threads").find((t) => t.id === 2)?.aiAnalysisStatus).toBe("ignored");
  });
});
