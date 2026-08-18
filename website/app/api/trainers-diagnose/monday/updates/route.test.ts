import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalUpdatesVoorItem } from "@/lib/sales/monday-client";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return { ...echt, haalUpdatesVoorItem: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockUpdates = vi.mocked(haalUpdatesVoorItem);

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers-diagnose/monday/updates", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockUpdates.mockReset().mockResolvedValue([
    { id: "u1", item_id: "123", text_body: "Voortgang besproken.", created_at: "2026-08-19T09:00:00Z", updated_at: "2026-08-19T09:00:00Z", creator: { id: "1", name: "Wessel Kok" } },
  ]);
});

describe("POST /api/trainers-diagnose/monday/updates", () => {
  it("weigert een niet-admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 2, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ itemId: "123" }));
    expect(response.status).toBe(403);
    expect(mockUpdates).not.toHaveBeenCalled();
  });

  it("weigert een ontbrekend/ongeldig itemId met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    expect((await POST(maakRequest({}))).status).toBe(400);
    expect((await POST(maakRequest({ itemId: "abc" }))).status).toBe(400);
    expect(mockUpdates).not.toHaveBeenCalled();
  });

  it("geeft de Updates van het opgegeven item terug — werkt voor elk item-ID (training of Master Data)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ itemId: "123" }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.updates).toHaveLength(1);
    expect(mockUpdates).toHaveBeenCalledWith("123", 30);
  });

  it("begrenst een aangevraagde limiet tot MAX_UPDATES (30)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    await POST(maakRequest({ itemId: "123", limit: 500 }));
    expect(mockUpdates).toHaveBeenCalledWith("123", 30);
  });
});
