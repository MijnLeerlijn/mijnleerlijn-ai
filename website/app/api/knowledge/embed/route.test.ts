import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { runKnowledgeEmbedding } from "@/lib/embeddings/run-embedding";

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/embeddings/run-embedding", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/embeddings/run-embedding")>();
  return { ...echt, runKnowledgeEmbedding: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockRun = vi.mocked(runKnowledgeEmbedding);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/knowledge/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockRun.mockReset();
});

describe("POST /api/knowledge/embed", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: {} }));

    expect(response.status).toBe(403);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("weigert een niet-beheerder (editor) met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-maar-editor", body: {} }));

    expect(response.status).toBe(403);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("verwerkt alle collecties (geen collection/ids) met de standaardlimiet", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRun.mockResolvedValue({
      verwerkt: 0,
      geembed: 0,
      overgeslagen: 0,
      genegeerd: 0,
      mislukt: 0,
      fouten: [],
    });

    const response = await POST(maakRequest({ cookie: "geldig-admin" }));

    expect(response.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith(expect.anything(), {
      collection: undefined,
      ids: undefined,
      limiet: 5,
    });
  });

  it("geeft collection + ids door (dekt zowel nieuw embedden als herembedden)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRun.mockResolvedValue({
      verwerkt: 2,
      geembed: 2,
      overgeslagen: 0,
      genegeerd: 0,
      mislukt: 0,
      fouten: [],
    });

    const response = await POST(
      maakRequest({ cookie: "geldig-admin", body: { collection: "knowledge-sources", ids: [10, 20] } })
    );
    const data = await response.json();

    expect(mockRun).toHaveBeenCalledWith(expect.anything(), {
      collection: "knowledge-sources",
      ids: [10, 20],
      limiet: 5,
    });
    expect(data.geembed).toBe(2);
  });

  it("weigert ids zonder collection met een duidelijke 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { ids: [1, 2] } }));

    expect(response.status).toBe(400);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("weigert een ongeldige collection met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { collection: "iets-anders" } }));

    expect(response.status).toBe(400);
    expect(mockRun).not.toHaveBeenCalled();
  });
});
