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
  return new NextRequest("http://localhost:3000/api/verbetercentrum/append-to-onderwerp", {
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
  mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
});

describe("POST /api/verbetercentrum/append-to-onderwerp", () => {
  it("weigert een aanvraag zonder adminsessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(
      maakRequest({ cookie: "geldig", body: { conversationId: 1, onderwerpId: 1, field: "synoniemen", text: "x" } })
    );

    expect(response.status).toBe(403);
  });

  it("weigert een ongeldig field met 400", async () => {
    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 1, onderwerpId: 1, field: "iets-anders", text: "x" },
      })
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert lege tekst met 400", async () => {
    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 1, onderwerpId: 1, field: "synoniemen", text: "   " },
      })
    );

    expect(response.status).toBe(400);
  });

  it("voegt een nieuwe synoniem toe aan de bestaande lijst", async () => {
    mockFindByIDPerCollectie({
      "kennisbasis-onderwerpen": { id: 3, synoniemen: ["doelen", "leerdoelen"] },
      "assistant-conversations": { id: 5, verbeterStatus: "beoordeeld" },
    });
    mockUpdate.mockResolvedValue({});

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 5, onderwerpId: 3, field: "synoniemen", text: "doeltjes" },
      })
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, toegevoegd: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "kennisbasis-onderwerpen",
        id: 3,
        data: { synoniemen: ["doelen", "leerdoelen", "doeltjes"] },
      })
    );
  });

  it("dedupliceert case-insensitive i.p.v. een duplicaat toe te voegen", async () => {
    mockFindByIDPerCollectie({
      "kennisbasis-onderwerpen": { id: 3, voorbeeldvragen: ["Hoe koppel ik doelen?"] },
      "assistant-conversations": { id: 5, verbeterStatus: "beoordeeld" },
    });
    mockUpdate.mockResolvedValue({});

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 5, onderwerpId: 3, field: "voorbeeldvragen", text: "hoe koppel ik doelen?" },
      })
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, toegevoegd: false });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { voorbeeldvragen: ["Hoe koppel ik doelen?"] } })
    );
  });

  it("bumpt de gespreksstatus van nieuw naar beoordeeld", async () => {
    mockFindByIDPerCollectie({
      "kennisbasis-onderwerpen": { id: 3, synoniemen: [] },
      "assistant-conversations": { id: 5, verbeterStatus: "nieuw" },
    });
    mockUpdate.mockResolvedValue({});

    await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 5, onderwerpId: 3, field: "synoniemen", text: "doelen" },
      })
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "assistant-conversations",
        data: { verbeterStatus: "beoordeeld" },
      })
    );
  });
});
