import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { searchKnowledge } from "@/lib/embeddings/similarity-search";

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/embeddings/similarity-search", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/embeddings/similarity-search")>();
  return { ...echt, searchKnowledge: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockSearch = vi.mocked(searchKnowledge);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/knowledge/search", {
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
  mockSearch.mockReset();
});

describe("POST /api/knowledge/search", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { query: "wachtwoord" } }));

    expect(response.status).toBe(403);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag zonder query met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: {} }));

    expect(response.status).toBe(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("geeft de treffers van searchKnowledge terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockSearch.mockResolvedValue([
      {
        type: "knowledge-draft",
        id: 1,
        title: "Wachtwoord resetten",
        similarity: 0.92,
        reason: "hoge semantische overlap",
      },
    ]);

    const response = await POST(
      maakRequest({ cookie: "geldig-admin", body: { query: "Hoe reset ik mijn wachtwoord?" } })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hits).toHaveLength(1);
    expect(data.hits[0].title).toBe("Wachtwoord resetten");
    expect(mockSearch).toHaveBeenCalledWith(expect.anything(), {
      query: "Hoe reset ik mijn wachtwoord?",
      limiet: undefined,
    });
  });
});
