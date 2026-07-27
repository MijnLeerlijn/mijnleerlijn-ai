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
  return new NextRequest("http://localhost:3000/api/verbetercentrum/link-manual", {
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

describe("POST /api/verbetercentrum/link-manual", () => {
  it("weigert een aanvraag zonder adminsessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 1, onderwerpId: 1, handleiding: { relationTo: "handleidingen", value: 10 } },
      })
    );

    expect(response.status).toBe(403);
  });

  it("weigert een ongeldige handleiding-vorm met 400", async () => {
    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 1, onderwerpId: 1, handleiding: { relationTo: "iets-anders", value: 10 } },
      })
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("voegt een nieuwe handleiding-koppeling toe", async () => {
    mockFindByIDPerCollectie({
      "kennisbasis-onderwerpen": { id: 3, gekoppeldeHandleidingen: [] },
      "assistant-conversations": { id: 5, verbeterStatus: "beoordeeld" },
    });
    mockUpdate.mockResolvedValue({});

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 5, onderwerpId: 3, handleiding: { relationTo: "handleidingen", value: 10 } },
      })
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, toegevoegd: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "kennisbasis-onderwerpen",
        id: 3,
        data: { gekoppeldeHandleidingen: [{ relationTo: "handleidingen", value: 10 }] },
      })
    );
  });

  it("dedupliceert op relationTo + id i.p.v. een duplicaat toe te voegen", async () => {
    mockFindByIDPerCollectie({
      "kennisbasis-onderwerpen": {
        id: 3,
        gekoppeldeHandleidingen: [{ relationTo: "knowledge-sources", value: 18 }],
      },
      "assistant-conversations": { id: 5, verbeterStatus: "beoordeeld" },
    });
    mockUpdate.mockResolvedValue({});

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 5, onderwerpId: 3, handleiding: { relationTo: "knowledge-sources", value: 18 } },
      })
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, toegevoegd: false });
  });

  it("behoudt bestaande koppelingen bij het toevoegen van een nieuwe (breidt uit, vervangt niet)", async () => {
    mockFindByIDPerCollectie({
      "kennisbasis-onderwerpen": {
        id: 3,
        gekoppeldeHandleidingen: [{ relationTo: "handleidingen", value: 10 }],
      },
      "assistant-conversations": { id: 5, verbeterStatus: "beoordeeld" },
    });
    mockUpdate.mockResolvedValue({});

    await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 5, onderwerpId: 3, handleiding: { relationTo: "knowledge-sources", value: 18 } },
      })
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          gekoppeldeHandleidingen: [
            { relationTo: "handleidingen", value: 10 },
            { relationTo: "knowledge-sources", value: 18 },
          ],
        },
      })
    );
  });
});
