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
  return new NextRequest("http://localhost:3000/api/verbetercentrum/link-onderwerp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

function mockFindByIDPerCollectie(waardenPerCollectie: Record<string, unknown>) {
  mockFindByID.mockImplementation(async (opts: { collection: string }) => waardenPerCollectie[opts.collection]);
}

beforeEach(() => {
  mockVerify.mockReset();
  mockFindByID.mockReset();
  mockUpdate.mockReset();
});

describe("POST /api/verbetercentrum/link-onderwerp", () => {
  it("weigert een aanvraag zonder adminsessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { conversationId: 1, onderwerpId: 1 } }));

    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag met ontbrekende velden met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { conversationId: 1 } }));

    expect(response.status).toBe(400);
  });

  it("geeft 404 als het kennisbasis-onderwerp niet bestaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByIDPerCollectie({ "kennisbasis-onderwerpen": undefined, "assistant-conversations": { id: 5 } });

    const response = await POST(maakRequest({ cookie: "geldig", body: { conversationId: 5, onderwerpId: 999 } }));

    expect(response.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("koppelt het onderwerp, legt de officiële term vast en bumpt status nieuw → beoordeeld", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByIDPerCollectie({
      "kennisbasis-onderwerpen": { id: 3, officieleTerm: "Doelenset koppelen aan leerlingen" },
      "assistant-conversations": { id: 5, verbeterStatus: "nieuw" },
    });
    mockUpdate.mockResolvedValue({});

    const response = await POST(maakRequest({ cookie: "geldig", body: { conversationId: 5, onderwerpId: 3 } }));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "assistant-conversations",
        id: 5,
        data: {
          kennisbasisOnderwerp: 3,
          gebruikteOfficieleTerm: "Doelenset koppelen aan leerlingen",
          verbeterStatus: "beoordeeld",
        },
      })
    );
  });

  it("laat een al-'opgelost'-status ongemoeid i.p.v. terug te zetten naar 'beoordeeld'", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByIDPerCollectie({
      "kennisbasis-onderwerpen": { id: 3, officieleTerm: "Term" },
      "assistant-conversations": { id: 5, verbeterStatus: "opgelost" },
    });
    mockUpdate.mockResolvedValue({});

    await POST(maakRequest({ cookie: "geldig", body: { conversationId: 5, onderwerpId: 3 } }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verbeterStatus: "opgelost" }) })
    );
  });
});
