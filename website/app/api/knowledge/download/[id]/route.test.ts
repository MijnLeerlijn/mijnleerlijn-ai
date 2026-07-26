import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { resolveerBestandsUrl } from "@/lib/knowledge/process-source";

const mockFindByID = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    findByID: (...args: unknown[]) => mockFindByID(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/knowledge/process-source", () => ({ resolveerBestandsUrl: vi.fn() }));

const mockResolve = vi.mocked(resolveerBestandsUrl);

function maakRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/knowledge/download/${id}`);
}

beforeEach(() => {
  mockFindByID.mockReset();
  mockResolve.mockReset();
});

describe("GET /api/knowledge/download/[id]", () => {
  it("geeft 400 bij een niet-numerieke id", async () => {
    const response = await GET(maakRequest("abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(400);
  });

  it("geeft 404 wanneer de bron niet bestaat", async () => {
    mockFindByID.mockRejectedValue(new Error("niet gevonden"));

    const response = await GET(maakRequest("9"), { params: Promise.resolve({ id: "9" }) });
    expect(response.status).toBe(404);
  });

  it("geeft 404 wanneer de bron niet 'zichtbaar' is — voorkomt dat een verborgen bron alsnog uitgeserveerd wordt", async () => {
    mockFindByID.mockResolvedValue({ id: 9, zichtbaar: false, file: 55 });

    const response = await GET(maakRequest("9"), { params: Promise.resolve({ id: "9" }) });

    expect(response.status).toBe(404);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer de bron zichtbaar is maar geen bestand heeft", async () => {
    mockFindByID.mockResolvedValue({ id: 9, zichtbaar: true, file: null });

    const response = await GET(maakRequest("9"), { params: Promise.resolve({ id: "9" }) });

    expect(response.status).toBe(404);
  });

  it("redirect naar de vers gegenereerde signed URL voor een zichtbare bron met bestand", async () => {
    mockFindByID.mockResolvedValue({ id: 9, zichtbaar: true, file: { id: 55 } });
    mockResolve.mockResolvedValue("https://voorbeeld.private.blob.vercel-storage.com/handleiding.pdf?token=x");

    const response = await GET(maakRequest("9"), { params: Promise.resolve({ id: "9" }) });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://voorbeeld.private.blob.vercel-storage.com/handleiding.pdf?token=x"
    );
    expect(mockResolve).toHaveBeenCalledWith(expect.anything(), 55);
  });

  it("geeft 502 wanneer het bestand niet opgehaald kon worden", async () => {
    mockFindByID.mockResolvedValue({ id: 9, zichtbaar: true, file: 55 });
    mockResolve.mockResolvedValue(null);

    const response = await GET(maakRequest("9"), { params: Promise.resolve({ id: "9" }) });
    expect(response.status).toBe(502);
  });
});
