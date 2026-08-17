import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { dempSignaal, maakMailTaak } from "@/lib/werk/mail-signalen";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/werk/mail-signalen", () => ({ dempSignaal: vi.fn(), maakMailTaak: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockDemp = vi.mocked(dempSignaal);
const mockTaak = vi.mocked(maakMailTaak);

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/werk/mail/actie", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockDemp.mockReset().mockResolvedValue(true);
  mockTaak.mockReset().mockResolvedValue({ taakId: 42 });
});

describe("POST /api/werk/mail/actie", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest({ actie: "dempen", signaalId: 5 }));
    expect(response.status).toBe(403);
    expect(mockDemp).not.toHaveBeenCalled();
  });

  it("weigert een onbekende actie met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ actie: "versturen", signaalId: 5 }));
    expect(response.status).toBe(400);
  });

  it("weigert een ontbrekend signaalId met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ actie: "dempen" }));
    expect(response.status).toBe(400);
  });

  it("'dempen' roept dempSignaal aan, gescoped op de ingelogde gebruiker", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ actie: "dempen", signaalId: 5 }));

    expect(response.status).toBe(200);
    expect(mockDemp).toHaveBeenCalledWith(expect.anything(), 7, 5);
  });

  it("'dempen' geeft 404 terug wanneer het signaal niet (van deze gebruiker) is", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockDemp.mockResolvedValue(false);

    const response = await POST(maakRequest({ actie: "dempen", signaalId: 999 }));
    expect(response.status).toBe(404);
  });

  it("'taak' vereist een titel en een geldige datum", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });

    const zonderTitel = await POST(maakRequest({ actie: "taak", signaalId: 5, datum: "2026-08-17" }));
    expect(zonderTitel.status).toBe(400);

    const zonderDatum = await POST(maakRequest({ actie: "taak", signaalId: 5, taakTitel: "Beantwoorden" }));
    expect(zonderDatum.status).toBe(400);
  });

  it("'taak' maakt een taak aan en geeft het taakId terug — nooit automatisch, altijd met een door de gebruiker bevestigde titel/datum", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ actie: "taak", signaalId: 5, taakTitel: "Beantwoorden: Vraag", taakBeschrijving: "Stelt een vraag.", datum: "2026-08-17" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.taakId).toBe(42);
    expect(mockTaak).toHaveBeenCalledWith(expect.anything(), 7, 5, { titel: "Beantwoorden: Vraag", beschrijving: "Stelt een vraag.", datum: "2026-08-17" });
  });

  it("'taak' geeft 404 terug wanneer het signaal niet (van deze gebruiker) is", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockTaak.mockResolvedValue(null);

    const response = await POST(maakRequest({ actie: "taak", signaalId: 999, taakTitel: "x", datum: "2026-08-17" }));
    expect(response.status).toBe(404);
  });

  it("geeft een generieke 500-fout terug wanneer de actie faalt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockDemp.mockRejectedValue(new Error("interne details die niet mogen lekken"));

    const response = await POST(maakRequest({ actie: "dempen", signaalId: 5 }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("interne details");
  });
});
