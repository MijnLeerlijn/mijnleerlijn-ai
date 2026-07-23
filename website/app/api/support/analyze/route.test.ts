import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { runSupportAnalysis } from "@/lib/support/run-analysis";

// Auth- en analyselogica zelf zijn al gedekt in lib/auth/verify-session.ts en
// lib/support/*.test.ts — deze test dekt uitsluitend de route zelf: wordt de
// sessie daadwerkelijk gecontroleerd vóórdat er iets gebeurt (scenario "geen
// beheerderssessie" uit de opdracht), en wordt de body correct doorgegeven.

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/support/run-analysis", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/support/run-analysis")>();
  return { ...echt, runSupportAnalysis: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockRun = vi.mocked(runSupportAnalysis);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/support/analyze", {
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
  mockRun.mockReset();
});

describe("POST /api/support/analyze", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403, zonder analyse te starten", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: {} }));

    expect(response.status).toBe(403);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag van een ingelogde niet-beheerder (editor) met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-maar-editor", body: {} }));

    expect(response.status).toBe(403);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("start een analyse met de standaardlimiet wanneer een beheerder een lege body stuurt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRun.mockResolvedValue({
      geanalyseerd: 0,
      conceptenGemaakt: 0,
      bestaandeConceptenBijgewerkt: 0,
      genegeerd: 0,
      mislukt: 0,
      fouten: [],
    });

    const response = await POST(maakRequest({ cookie: "geldig-admin" }));

    expect(response.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith(expect.anything(), { threadIds: undefined, limiet: 5 });
  });

  it("geeft expliciete threadIds door aan de analyse", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRun.mockResolvedValue({
      geanalyseerd: 2,
      conceptenGemaakt: 1,
      bestaandeConceptenBijgewerkt: 0,
      genegeerd: 1,
      mislukt: 0,
      fouten: [],
    });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { threadIds: [10, 20] } }));
    const data = await response.json();

    expect(mockRun).toHaveBeenCalledWith(expect.anything(), { threadIds: [10, 20], limiet: 5 });
    expect(data.conceptenGemaakt).toBe(1);
  });
});
