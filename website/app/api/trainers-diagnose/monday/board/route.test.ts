import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalBoardStructuur } from "@/lib/trainers-diagnose/monday-readonly";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers-diagnose/monday-readonly", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers-diagnose/monday-readonly")>();
  return { ...echt, haalBoardStructuur: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockStructuur = vi.mocked(haalBoardStructuur);

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers-diagnose/monday/board", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const RUWE_STRUCTUUR = {
  id: "999",
  name: "Trainer Wessel Kok",
  groups: [{ id: "grp1", title: "IKC Borgmanschool Oosterpark" }],
  columns: [{ id: "date_xyz", title: "Datum gepland", type: "date" }],
  items: [],
  meerItemsBeschikbaar: false,
};

beforeEach(() => {
  mockVerify.mockReset();
  mockStructuur.mockReset().mockResolvedValue(RUWE_STRUCTUUR);
});

describe("POST /api/trainers-diagnose/monday/board", () => {
  it("weigert een niet-admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 2, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ boardId: "999" }));
    expect(response.status).toBe(403);
    expect(mockStructuur).not.toHaveBeenCalled();
  });

  it("weigert een ontbrekend/ongeldig boardId met 400 — geen Monday-aanroep", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    const zonder = await POST(maakRequest({}));
    expect(zonder.status).toBe(400);
    const ongeldig = await POST(maakRequest({ boardId: "niet-numeriek" }));
    expect(ongeldig.status).toBe(400);
    expect(mockStructuur).not.toHaveBeenCalled();
  });

  it("geeft de boardstructuur terug voor een geldig boardId", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ boardId: "999" }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.structuur).toEqual(RUWE_STRUCTUUR);
  });

  it("geeft 404 terug wanneer het board niet bestaat/onbereikbaar is", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockStructuur.mockResolvedValue(null);
    const response = await POST(maakRequest({ boardId: "999" }));
    expect(response.status).toBe(404);
  });

  it("beperkt tot 10 aanvragen per minuut per admin", async () => {
    mockVerify.mockResolvedValue({ user: { id: 9, role: "admin" }, cookieAanwezig: true });
    for (let i = 0; i < 10; i++) {
      expect((await POST(maakRequest({ boardId: "999" }))).status).toBe(200);
    }
    expect((await POST(maakRequest({ boardId: "999" }))).status).toBe(429);
  });
});
