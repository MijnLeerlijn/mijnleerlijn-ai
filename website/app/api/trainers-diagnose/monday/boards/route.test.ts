import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { lijstAlleBoards } from "@/lib/trainers-diagnose/monday-readonly";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers-diagnose/monday-readonly", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers-diagnose/monday-readonly")>();
  return { ...echt, lijstAlleBoards: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockLijst = vi.mocked(lijstAlleBoards);

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers-diagnose/monday/boards", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockLijst.mockReset().mockResolvedValue([{ id: "1", name: "1: Scholen (Master Data)", items_count: 42, state: "active" }]);
});

describe("POST /api/trainers-diagnose/monday/boards", () => {
  it("weigert een niet-admin (editor) met 403 — geen Monday-aanroep", async () => {
    mockVerify.mockResolvedValue({ user: { id: 2, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest());
    expect(response.status).toBe(403);
    expect(mockLijst).not.toHaveBeenCalled();
  });

  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest());
    expect(response.status).toBe(403);
  });

  it("geeft de boardlijst terug voor een admin", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    const response = await POST(maakRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.boards).toHaveLength(1);
  });

  it("beperkt tot 10 aanvragen per minuut per admin (429 daarna)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 9, role: "admin" }, cookieAanwezig: true });
    for (let i = 0; i < 10; i++) {
      const response = await POST(maakRequest());
      expect(response.status).toBe(200);
    }
    const elfde = await POST(maakRequest());
    expect(elfde.status).toBe(429);
  });

  it("geeft een 500-fout terug zonder het token te lekken bij een mislukte Monday-aanroep", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockLijst.mockRejectedValue(new Error("Monday API-aanroep mislukt (HTTP 401)."));
    const response = await POST(maakRequest());
    const data = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).not.toMatch(/Bearer|token/i);
  });
});
