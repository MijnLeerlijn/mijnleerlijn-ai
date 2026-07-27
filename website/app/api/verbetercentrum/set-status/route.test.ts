import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockUpdate = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
  return new NextRequest("http://localhost:3000/api/verbetercentrum/set-status", {
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
  mockUpdate.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
});

describe("POST /api/verbetercentrum/set-status", () => {
  it("weigert een aanvraag zonder adminsessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { conversationId: 1, status: "opgelost" } }));

    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert een ongeldige status met 400", async () => {
    const response = await POST(
      maakRequest({ cookie: "geldig", body: { conversationId: 1, status: "iets-anders" } })
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("zet de status op 'opgelost'", async () => {
    mockUpdate.mockResolvedValue({});

    const response = await POST(maakRequest({ cookie: "geldig", body: { conversationId: 5, status: "opgelost" } }));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "assistant-conversations",
        id: 5,
        data: { verbeterStatus: "opgelost" },
      })
    );
  });

  it("zet de status op 'genegeerd'", async () => {
    mockUpdate.mockResolvedValue({});

    const response = await POST(maakRequest({ cookie: "geldig", body: { conversationId: 5, status: "genegeerd" } }));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { verbeterStatus: "genegeerd" } })
    );
  });
});
