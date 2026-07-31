import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { resolveerBestandsUrl } from "@/lib/knowledge/process-source";

const mockFindByID = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    findByID: (...args: unknown[]) => mockFindByID(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/knowledge/process-source", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/knowledge/process-source")>();
  return { ...echt, resolveerBestandsUrl: vi.fn() };
});

const mockResolveerBestandsUrl = vi.mocked(resolveerBestandsUrl);

function maakRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/media/${id}`);
}

function maakParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockFindByID.mockReset();
  mockResolveerBestandsUrl.mockReset();
});

// Uniforme private-uploadarchitectuur (2026-07-31): de enige, stabiele,
// publiek te gebruiken leesroute voor Media-documenten — reikt uitsluitend
// een kortlevende signed URL door (via de al bestaande, elders al geteste
// resolveerBestandsUrl()) voor een pathname die letterlijk uit het
// opgevraagde Media-document zelf komt, nooit uit client-input.
describe("GET /api/media/[id]", () => {
  it("geeft 400 bij een ongeldig media-ID", async () => {
    const response = await GET(maakRequest("niet-een-getal"), maakParams("niet-een-getal"));
    expect(response.status).toBe(400);
    expect(mockFindByID).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer het Media-document niet bestaat (onbekend of verwijderd ID)", async () => {
    mockFindByID.mockResolvedValue(undefined);
    const response = await GET(maakRequest("999"), maakParams("999"));
    expect(response.status).toBe(404);
    expect(mockResolveerBestandsUrl).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer resolveerBestandsUrl geen URL kan opleveren (leeg/kapot bestand)", async () => {
    mockFindByID.mockResolvedValue({ id: 5, url: null });
    mockResolveerBestandsUrl.mockResolvedValue(null);
    const response = await GET(maakRequest("5"), maakParams("5"));
    expect(response.status).toBe(404);
  });

  it("redirect (302) naar de door resolveerBestandsUrl teruggegeven URL, met no-store cache-headers", async () => {
    mockFindByID.mockResolvedValue({ id: 5, url: "https://xyz.private.blob.vercel-storage.com/media/abc-logo.png" });
    mockResolveerBestandsUrl.mockResolvedValue("https://xyz.private.blob.vercel-storage.com/media/abc-logo.png?signature=xyz");

    const response = await GET(maakRequest("5"), maakParams("5"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://xyz.private.blob.vercel-storage.com/media/abc-logo.png?signature=xyz"
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mockResolveerBestandsUrl).toHaveBeenCalledWith(expect.anything(), 5);
  });

  it("gebruikt uitsluitend het numerieke ID uit het pad — geen client-aangeleverde URL wordt ooit aan resolveerBestandsUrl doorgegeven", async () => {
    mockFindByID.mockResolvedValue({ id: 7, url: "https://xyz.private.blob.vercel-storage.com/media/y.png" });
    mockResolveerBestandsUrl.mockResolvedValue("https://xyz.private.blob.vercel-storage.com/media/y.png?signature=y");

    await GET(maakRequest("7"), maakParams("7"));

    const call = mockResolveerBestandsUrl.mock.calls[0];
    expect(call?.[1]).toBe(7);
    expect(typeof call?.[1]).toBe("number");
  });
});
