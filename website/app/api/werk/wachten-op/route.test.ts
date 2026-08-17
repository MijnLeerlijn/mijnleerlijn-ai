import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { bepaalWachtenOp } from "@/lib/werk/wachten-op";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/werk/wachten-op", () => ({ bepaalWachtenOp: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockWachtenOp = vi.mocked(bepaalWachtenOp);

function maakRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/werk/wachten-op", {
    headers: cookie ? { Cookie: `payload-token=${cookie}` } : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockWachtenOp.mockReset();
});

describe("GET /api/werk/wachten-op", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await GET(maakRequest());

    expect(response.status).toBe(403);
    expect(mockWachtenOp).not.toHaveBeenCalled();
  });

  it("geeft de Wachten-op-items terug voor een ingelogde editor", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockWachtenOp.mockResolvedValue([
      { schoolId: 10, schoolName: "Testschool", relatiestatus: "Prospect", plaats: "Zwolle", waaropWachten: "Reactie", sindsWanneer: "2026-08-10", vervolgdatum: "2026-08-25", actionId: 1 },
    ]);

    const response = await GET(maakRequest("geldig-editor"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].schoolName).toBe("Testschool");
  });

  it("geeft een lege lijst terug wanneer niemand op de school wacht (niet: fout)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockWachtenOp.mockResolvedValue([]);

    const response = await GET(maakRequest("geldig-admin"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toEqual([]);
  });

  it("geeft een nette 500 met foutmelding wanneer bepaalWachtenOp faalt, geen technische details", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockWachtenOp.mockRejectedValue(new Error("Database niet bereikbaar."));

    const response = await GET(maakRequest("geldig-admin"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Database niet bereikbaar.");
  });
});
