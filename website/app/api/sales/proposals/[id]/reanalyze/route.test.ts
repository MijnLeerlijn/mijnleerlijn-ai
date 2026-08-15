import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { heranalyseerVoorstel } from "@/lib/sales/proposal-reanalyze";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/proposal-reanalyze", () => ({ heranalyseerVoorstel: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockHeranalyseer = vi.mocked(heranalyseerVoorstel);

function maakRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/sales/proposals/50/reanalyze", {
    method: "POST",
    headers: cookie ? { Cookie: `payload-token=${cookie}` } : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockHeranalyseer.mockReset();
});

describe("POST /api/sales/proposals/[id]/reanalyze", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest(), { params: Promise.resolve({ id: "50" }) });

    expect(response.status).toBe(403);
    expect(mockHeranalyseer).not.toHaveBeenCalled();
  });

  it("geeft 400 voor een ongeldig voorstel-ID", async () => {
    const response = await POST(maakRequest("geldig-editor"), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(400);
    expect(mockHeranalyseer).not.toHaveBeenCalled();
  });

  it("geeft het resultaat terug bij succes", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockHeranalyseer.mockResolvedValue({ status: "nieuw_voorstel", proposalId: 99 });

    const response = await POST(maakRequest("geldig-editor"), { params: Promise.resolve({ id: "50" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "nieuw_voorstel", proposalId: 99 });
    expect(mockHeranalyseer).toHaveBeenCalledWith(expect.anything(), 50, 7);
  });

  it("geeft een nette 500 zonder technische details wanneer heranalyseerVoorstel faalt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockHeranalyseer.mockRejectedValue(new Error("Dit voorstel is al afgehandeld — opnieuw analyseren kan niet meer."));

    const response = await POST(maakRequest("geldig-editor"), { params: Promise.resolve({ id: "50" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Dit voorstel is al afgehandeld — opnieuw analyseren kan niet meer.");
  });

  it("geeft 404 wanneer het voorstel niet bestaat — geen ander record lekken via een generieke fout", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockHeranalyseer.mockRejectedValue(new Error("Voorstel niet gevonden."));

    const response = await POST(maakRequest("geldig-editor"), { params: Promise.resolve({ id: "50" }) });

    expect(response.status).toBe(404);
  });
});
