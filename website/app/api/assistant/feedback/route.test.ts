import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockFindByID = vi.fn();
const mockUpdate = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    findByID: (...args: unknown[]) => mockFindByID(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/assistant/feedback", {
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
  mockFindByID.mockReset();
  mockUpdate.mockReset();
});

describe("POST /api/assistant/feedback", () => {
  it("weigert een aanvraag zonder sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { conversationId: 1, rating: "nuttig" } }));

    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert een ongeldige rating met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(
      maakRequest({ cookie: "geldig", body: { conversationId: 1, rating: "iets-anders" } })
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert feedback op andermans gesprek met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 5, user: 999 });

    const response = await POST(
      maakRequest({ cookie: "geldig", body: { conversationId: 5, rating: "nuttig" } })
    );

    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("staat een beheerder toe feedback te geven op andermans gesprek", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 5, user: 999 });
    mockUpdate.mockResolvedValue({});

    const response = await POST(
      maakRequest({ cookie: "geldig", body: { conversationId: 5, rating: "nuttig" } })
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("slaat 👍-feedback op voor de eigen gesprekseigenaar", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 5, user: 1 });
    mockUpdate.mockResolvedValue({});

    const response = await POST(
      maakRequest({ cookie: "geldig", body: { conversationId: 5, rating: "nuttig" } })
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ feedbackRating: "nuttig" }) })
    );
  });

  it("slaat 👎-feedback met 'wat miste er' op", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 5, user: 1 });
    mockUpdate.mockResolvedValue({});

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 5, rating: "niet_nuttig", missing: "De stappen voor school-instellingen." },
      })
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          feedbackRating: "niet_nuttig",
          feedbackMissing: "De stappen voor school-instellingen.",
        }),
      })
    );
  });
});
