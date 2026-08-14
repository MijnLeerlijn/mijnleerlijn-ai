import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Object-level-autorisatie (sessie-eis §23.D): een zelfgekozen school-ID dat
// niet bestaat mag nooit een 500/stacktrace of een ander record lekken —
// altijd een nette 404. Mocking-patroon zelfde als app/api/contact/route.test.ts
// (plain `new NextRequest(url, init)` — werkt aantoonbaar in deze omgeving).
const mockFindByID = vi.fn();
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({ findByID: mockFindByID }) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/payload/access/roles", () => ({ isEditor: () => true }));
vi.mock("@/lib/auth/verify-session", () => ({
  verifyAdminSessionCookie: vi.fn().mockResolvedValue({ user: { id: 7, role: "editor" } }),
  PAYLOAD_SESSION_COOKIE_NAME: "payload-token",
}));
vi.mock("@/lib/sales/school-chat", () => ({ stelVraagOverSchool: vi.fn() }));

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/sales/school/999/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sales/school/[id]/chat — object-level autorisatie", () => {
  beforeEach(() => {
    mockFindByID.mockReset();
  });

  it("geeft 404 voor een niet-bestaand school-ID — geen 500, geen stacktrace, geen ander record", async () => {
    mockFindByID.mockRejectedValue(new Error("Not Found"));
    const { POST } = await import("./route");

    const response = await POST(maakRequest({ vraag: "wat is de status?" }), { params: Promise.resolve({ id: "999" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("School niet gevonden.");
    expect(JSON.stringify(data)).not.toMatch(/stack|at Object|node_modules/i);
  });

  it("geeft 400 voor een niet-numeriek school-ID — geen database-aanroep", async () => {
    const { POST } = await import("./route");

    const response = await POST(maakRequest({ vraag: "x" }), { params: Promise.resolve({ id: "niet-een-getal" }) });

    expect(response.status).toBe(400);
    expect(mockFindByID).not.toHaveBeenCalled();
  });
});
