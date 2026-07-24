import { describe, it, expect, vi, beforeEach } from "vitest";
import { processKnowledgeSource } from "./process-source";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { indexeerBron } from "./index-source";
import { genereerDownloadUrl } from "@/services/storage";

vi.mock("./index-source", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./index-source")>();
  return { ...echt, indexeerBron: vi.fn() };
});
vi.mock("@/services/storage", () => ({ genereerDownloadUrl: vi.fn() }));
const mockIndexeerBron = vi.mocked(indexeerBron);
const mockGenereerDownloadUrl = vi.mocked(genereerDownloadUrl);

const basisIndexUitkomst = {
  type: "indexed" as const,
  summary: "Een samenvatting.",
  keywords: ["kw1"],
  category: "profielen",
  chapters: [],
};

beforeEach(() => {
  mockIndexeerBron.mockReset();
  mockGenereerDownloadUrl.mockReset();
});

describe("processKnowledgeSource — PDF-bestandsresolutie", () => {
  it("zet een relatieve media-URL om naar een absolute URL vóór het indexeren", async () => {
    mockIndexeerBron.mockResolvedValue(basisIndexUitkomst);
    const { payload } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Handleiding", type: "pdf" }],
      media: [{ id: 42, url: "/api/media/file/handleiding.pdf" }],
    });

    await processKnowledgeSource(payload, { id: 1, title: "Handleiding", type: "pdf", file: 42 });

    expect(mockIndexeerBron).toHaveBeenCalledWith(
      expect.objectContaining({ fileUrl: "http://localhost:3000/api/media/file/handleiding.pdf" })
    );
  });

  it("gebruikt een absolute media-URL (bv. Vercel Blob) rechtstreeks", async () => {
    mockIndexeerBron.mockResolvedValue(basisIndexUitkomst);
    const { payload } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Handleiding", type: "pdf" }],
      media: [{ id: 42, url: "https://blob.vercel-storage.com/handleiding.pdf" }],
    });

    await processKnowledgeSource(payload, { id: 1, title: "Handleiding", type: "pdf", file: 42 });

    expect(mockIndexeerBron).toHaveBeenCalledWith(
      expect.objectContaining({ fileUrl: "https://blob.vercel-storage.com/handleiding.pdf" })
    );
  });

  it("genereert een kortlevende signed URL voor een private Blob-URL (Sprint 6: handleidingen) i.p.v. de opgeslagen URL rechtstreeks te gebruiken", async () => {
    mockIndexeerBron.mockResolvedValue(basisIndexUitkomst);
    mockGenereerDownloadUrl.mockResolvedValue(
      "https://voorbeeld.private.blob.vercel-storage.com/handleidingen/abc__handleiding.pdf?token=signed"
    );
    const { payload } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Handleiding", type: "pdf" }],
      media: [
        {
          id: 42,
          url: "https://storeid123.private.blob.vercel-storage.com/handleidingen/abc123__handleiding.pdf",
        },
      ],
    });

    await processKnowledgeSource(payload, { id: 1, title: "Handleiding", type: "pdf", file: 42 });

    expect(mockGenereerDownloadUrl).toHaveBeenCalledWith("handleidingen/abc123__handleiding.pdf");
    expect(mockIndexeerBron).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUrl:
          "https://voorbeeld.private.blob.vercel-storage.com/handleidingen/abc__handleiding.pdf?token=signed",
      })
    );
  });

  it("vraagt geen mediabestand op voor niet-PDF-typen", async () => {
    mockIndexeerBron.mockResolvedValue(basisIndexUitkomst);
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Website", type: "website", url: "https://mijnleerlijn.nl" }],
      media: [],
    });

    await processKnowledgeSource(payload, {
      id: 1,
      title: "Website",
      type: "website",
      url: "https://mijnleerlijn.nl",
    });

    expect(mockIndexeerBron).toHaveBeenCalledWith(expect.objectContaining({ fileUrl: null }));
    expect(collection("media")).toHaveLength(0);
  });
});

describe("processKnowledgeSource — succesvolle indexering", () => {
  it("schrijft status 'indexed' met AI-resultaten weg", async () => {
    mockIndexeerBron.mockResolvedValue(basisIndexUitkomst);
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Handleiding", type: "website", url: "https://mijnleerlijn.nl" }],
    });

    const uitkomst = await processKnowledgeSource(payload, {
      id: 1,
      title: "Handleiding",
      type: "website",
      url: "https://mijnleerlijn.nl",
    });

    expect(uitkomst).toEqual({ type: "indexed" });
    const doc = collection("knowledge-sources")[0]!;
    expect(doc.status).toBe("indexed");
    expect(doc.aiSummary).toBe("Een samenvatting.");
    expect(doc.aiKeywords).toEqual(["kw1"]);
    expect(doc.aiCategory).toBe("profielen");
    expect(doc.aiIndexedAt).toBeTruthy();
  });

  it("koppelt automatisch aan bestaande concepten met voldoende trefwoordoverlap (beide richtingen)", async () => {
    mockIndexeerBron.mockResolvedValue({
      ...basisIndexUitkomst,
      category: "profielen",
      keywords: ["hoofdprofiel", "aanmaken"],
    });
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [
        { id: 1, title: "Hoofdprofiel aanmaken", type: "handleiding", url: "https://mijnleerlijn.nl/help" },
      ],
      "knowledge-drafts": [
        {
          id: 501,
          title: "Hoofdprofiel aanmaken lukt niet",
          category: "profielen",
          keywords: ["hoofdprofiel", "aanmaken"],
        },
      ],
    });

    await processKnowledgeSource(payload, {
      id: 1,
      title: "Hoofdprofiel aanmaken",
      type: "handleiding",
      url: "https://mijnleerlijn.nl/help",
    });

    const source = collection("knowledge-sources")[0]!;
    expect(source.knowledgeDrafts).toEqual([501]);
    const draft = collection("knowledge-drafts")[0]!;
    expect(draft.knowledgeSources).toEqual([1]);
  });

  it("herberekent koppelingen volledig bij herindexeren, zonder te stapelen", async () => {
    const bron = {
      id: 1,
      title: "Hoofdprofiel aanmaken",
      type: "handleiding" as const,
      url: "https://mijnleerlijn.nl/help",
    };
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [{ ...bron, knowledgeDrafts: [999] }], // verouderde koppeling van vóór herindexeren
      "knowledge-drafts": [
        {
          id: 999,
          title: "Oud, niet meer relevant concept",
          category: "iets-anders",
          keywords: ["irrelevant"],
        },
        {
          id: 501,
          title: "Hoofdprofiel aanmaken lukt niet",
          category: "profielen",
          keywords: ["hoofdprofiel", "aanmaken"],
        },
      ],
    });
    mockIndexeerBron.mockResolvedValue({
      ...basisIndexUitkomst,
      category: "profielen",
      keywords: ["hoofdprofiel", "aanmaken"],
    });

    await processKnowledgeSource(payload, bron);

    const source = collection("knowledge-sources")[0]!;
    expect(source.knowledgeDrafts).toEqual([501]);
  });
});

describe("processKnowledgeSource — fout", () => {
  it("zet status op 'error' met de foutmelding, zonder concepten te koppelen", async () => {
    mockIndexeerBron.mockResolvedValue({ type: "failed", foutmelding: "PDF bevat geen leesbare tekst." });
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Leeg document", type: "pdf" }],
    });

    const uitkomst = await processKnowledgeSource(payload, { id: 1, title: "Leeg document", type: "pdf" });

    expect(uitkomst).toEqual({ type: "failed", foutmelding: "PDF bevat geen leesbare tekst." });
    const doc = collection("knowledge-sources")[0]!;
    expect(doc.status).toBe("error");
    expect(doc.indexError).toBe("PDF bevat geen leesbare tekst.");
    expect(doc.knowledgeDrafts).toBeUndefined();
  });
});
