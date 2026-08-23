import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { genereerBestandDownloadUrlAlsAdmin } from "@/lib/trainers/bestanden";

// Traineromgeving V2, Fase 3 (2026-08-23) — admin-downloadvariant, §13:
// "Admin mag altijd downloaden." Aparte route/cookiemechanisme van de
// trainer-downloadroute (zie de doc-comment in route.ts).

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/bestanden", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/bestanden")>();
  return { ...echt, genereerBestandDownloadUrlAlsAdmin: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockGenereerUrl = vi.mocked(genereerBestandDownloadUrlAlsAdmin);

function maakRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/trainer-bestanden/${id}/download`);
}

beforeEach(() => {
  mockVerify.mockReset();
  mockGenereerUrl.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("GET /api/trainer-bestanden/[id]/download", () => {
  it("weigert een niet-editor met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest("1"), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(403);
    expect(mockGenereerUrl).not.toHaveBeenCalled();
  });

  it("404 als het bestand niet bestaat", async () => {
    mockGenereerUrl.mockResolvedValue(null);
    const response = await GET(maakRequest("999"), { params: Promise.resolve({ id: "999" }) });
    expect(response.status).toBe(404);
  });

  it("redirect (302) naar de signed URL voor een editor, ongeacht wie het bestand uploadde", async () => {
    mockGenereerUrl.mockResolvedValue("https://signed.example/admin");
    const response = await GET(maakRequest("1"), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed.example/admin");
  });
});
