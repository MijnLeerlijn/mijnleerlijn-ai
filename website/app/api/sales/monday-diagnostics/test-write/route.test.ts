import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { voerDiagnostischeSchrijfTest } from "@/lib/sales/monday-diagnostics";
import { SCHOLEN_KOLOM } from "@/lib/sales/monday-columns";

const { mockFindByID } = vi.hoisted(() => ({ mockFindByID: vi.fn() }));
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({ findByID: mockFindByID }) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/monday-diagnostics", () => ({ voerDiagnostischeSchrijfTest: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockSchrijfTest = vi.mocked(voerDiagnostischeSchrijfTest);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/sales/monday-diagnostics/test-write", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}) },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

const GELDIG_BODY = { schoolId: 21, columnId: SCHOLEN_KOLOM.typeSchool, testWaarde: "Montessori", verwachteHuidigeWaarde: null };

beforeEach(() => {
  mockVerify.mockReset();
  mockFindByID.mockReset();
  mockSchrijfTest.mockReset();
});

describe("POST /api/sales/monday-diagnostics/test-write", () => {
  it("weigert zonder sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: GELDIG_BODY }));

    expect(response.status).toBe(403);
    expect(mockSchrijfTest).not.toHaveBeenCalled();
  });

  it("weigert een gewone editor met 403 — echte productie-CRM-schrijftoegang is admin-only", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ body: GELDIG_BODY }));

    expect(response.status).toBe(403);
    expect(mockSchrijfTest).not.toHaveBeenCalled();
  });

  it("weigert een niet-toegestane column-ID — nooit de client vertrouwen, ook al is dit een admin", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ body: { ...GELDIG_BODY, columnId: "color_mm4vvg4r" } })); // Relatiestatus — nooit schrijfbaar

    expect(response.status).toBe(400);
    expect(mockSchrijfTest).not.toHaveBeenCalled();
  });

  it("weigert een ongeldige Type-school-testwaarde vóór er iets gebeurt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ body: { ...GELDIG_BODY, testWaarde: "Onzin" } }));

    expect(response.status).toBe(400);
    expect(mockSchrijfTest).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer de school niet bestaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue(null);

    const response = await POST(maakRequest({ body: GELDIG_BODY }));

    expect(response.status).toBe(404);
    expect(mockSchrijfTest).not.toHaveBeenCalled();
  });

  it("voert de testschrijving uit met de mondayItemId van de opgezochte school, niet een client-waarde", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 21, mondayItemId: "999888" });
    mockSchrijfTest.mockResolvedValue({ schrijfResultaat: { status: "geschreven", boodschap: "ok" }, gelezenNaSchrijven: "Montessori", bevestigd: true });

    const response = await POST(maakRequest({ body: GELDIG_BODY }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.bevestigd).toBe(true);
    expect(mockSchrijfTest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schoolId: 21, mondayItemId: "999888", columnId: SCHOLEN_KOLOM.typeSchool, testWaarde: "Montessori", actorId: 1 })
    );
  });

  it("geeft ook een 200 terug bij een conflict — de UI toont de reden, geen 500 voor een verwacht resultaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 21, mondayItemId: "999888" });
    mockSchrijfTest.mockResolvedValue({ schrijfResultaat: { status: "conflict", boodschap: "Conflict: Monday is gewijzigd" }, gelezenNaSchrijven: null, bevestigd: false });

    const response = await POST(maakRequest({ body: GELDIG_BODY }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schrijfResultaat.status).toBe("conflict");
  });
});
