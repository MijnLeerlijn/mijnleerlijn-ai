import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { zoekItemMetBoard } from "@/lib/trainers-diagnose/monday-readonly";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers-diagnose/monday-readonly", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers-diagnose/monday-readonly")>();
  return { ...echt, zoekItemMetBoard: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockZoek = vi.mocked(zoekItemMetBoard);

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers-diagnose/monday/item-board", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockZoek.mockReset().mockResolvedValue({ id: "123", name: "Jeroen Bakker", board: { id: "18420999", name: "8: Contactpersonen" } });
});

describe("POST /api/trainers-diagnose/monday/item-board", () => {
  it("weigert een niet-admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 2, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ itemId: "123" }));
    expect(response.status).toBe(403);
    expect(mockZoek).not.toHaveBeenCalled();
  });

  it("weigert een ontbrekend/ongeldig itemId met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    expect((await POST(maakRequest({}))).status).toBe(400);
    expect((await POST(maakRequest({ itemId: "niet-numeriek" }))).status).toBe(400);
  });

  it("herleidt een item-ID naar zijn board", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ itemId: "123" }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.item.board).toEqual({ id: "18420999", name: "8: Contactpersonen" });
  });

  it("geeft 404 terug voor een onbestaand item", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockZoek.mockResolvedValue(null);
    const response = await POST(maakRequest({ itemId: "999999" }));
    expect(response.status).toBe(404);
  });
});
