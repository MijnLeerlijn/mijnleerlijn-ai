import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { genereerStartbegeleidingSamenvatting } from "@/lib/trainers/startbegeleiding";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/startbegeleiding", () => ({ genereerStartbegeleidingSamenvatting: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockGenereer = vi.mocked(genereerStartbegeleidingSamenvatting);

function maakRequest(query = "") {
  return new NextRequest(`http://localhost:3000/api/admin/trainers/startbegeleiding/samenvatting${query}`);
}

beforeEach(() => {
  mockVerify.mockReset();
  mockGenereer.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("GET /api/admin/trainers/startbegeleiding/samenvatting", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest("?id=s1"));
    expect(response.status).toBe(403);
    expect(mockGenereer).not.toHaveBeenCalled();
  });

  it("geeft 400 zonder id-parameter", async () => {
    const response = await GET(maakRequest());
    expect(response.status).toBe(400);
  });

  it("geeft de gegenereerde samenvatting terug", async () => {
    mockGenereer.mockResolvedValue("Korte samenvatting.");
    const response = await GET(maakRequest("?id=s1"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.samenvatting).toBe("Korte samenvatting.");
    expect(mockGenereer).toHaveBeenCalledWith("s1");
  });

  it("geeft 502 terug wanneer het genereren mislukt (bv. AI-timeout)", async () => {
    mockGenereer.mockRejectedValue(new Error("AI-timeout"));
    const response = await GET(maakRequest("?id=s1"));
    expect(response.status).toBe(502);
  });
});
