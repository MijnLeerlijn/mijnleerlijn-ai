import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockFindByID = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    findByID: (...args: unknown[]) => mockFindByID(...args),
    create: (...args: unknown[]) => mockCreate(...args),
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
  return new NextRequest("http://localhost:3000/api/verbetercentrum/create-onderwerp", {
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
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
});

describe("POST /api/verbetercentrum/create-onderwerp", () => {
  it("weigert een aanvraag zonder adminsessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 1, onderwerp: { onderwerp: "X", officieleTerm: "Y" } },
      })
    );

    expect(response.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag zonder onderwerp.onderwerp of officieleTerm met 400", async () => {
    const zonderTerm = await POST(
      maakRequest({ cookie: "geldig", body: { conversationId: 1, onderwerp: { onderwerp: "X" } } })
    );
    expect(zonderTerm.status).toBe(400);

    const zonderTitel = await POST(
      maakRequest({ cookie: "geldig", body: { conversationId: 1, onderwerp: { officieleTerm: "Y" } } })
    );
    expect(zonderTitel.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("geeft 404 als het gesprek niet bestaat", async () => {
    mockFindByID.mockResolvedValue(undefined);

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: { conversationId: 999, onderwerp: { onderwerp: "X", officieleTerm: "Y" } },
      })
    );

    expect(response.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("forceert status 'concept', ongeacht wat de client meestuurt", async () => {
    mockFindByID.mockResolvedValue({ id: 5, verbeterStatus: "nieuw" });
    mockCreate.mockResolvedValue({ id: 42, officieleTerm: "Leerdoel toevoegen aan leerling" });
    mockUpdate.mockResolvedValue({});

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: {
          conversationId: 5,
          onderwerp: {
            onderwerp: "Doelen koppelen aan één leerling",
            officieleTerm: "Leerdoel toevoegen aan leerling",
            status: "gepubliceerd", // moet genegeerd worden
          },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "kennisbasis-onderwerpen",
        data: expect.objectContaining({ status: "concept" }),
      })
    );
  });

  it("koppelt het gesprek direct aan het nieuw aangemaakte onderwerp en bumpt de status", async () => {
    mockFindByID.mockResolvedValue({ id: 5, verbeterStatus: "nieuw" });
    mockCreate.mockResolvedValue({ id: 42, officieleTerm: "Leerdoel toevoegen aan leerling" });
    mockUpdate.mockResolvedValue({});

    const response = await POST(
      maakRequest({
        cookie: "geldig",
        body: {
          conversationId: 5,
          onderwerp: { onderwerp: "Doelen koppelen aan één leerling", officieleTerm: "Leerdoel toevoegen aan leerling" },
        },
      })
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, onderwerpId: 42 });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "assistant-conversations",
        id: 5,
        data: {
          kennisbasisOnderwerp: 42,
          gebruikteOfficieleTerm: "Leerdoel toevoegen aan leerling",
          verbeterStatus: "beoordeeld",
        },
      })
    );
  });
});
