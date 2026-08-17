import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { dempSignaal, maakVoorbereidingstaak, herinnerMorgen } from "@/lib/werk/voorbereiding";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/werk/voorbereiding", () => ({
  dempSignaal: vi.fn(),
  maakVoorbereidingstaak: vi.fn(),
  herinnerMorgen: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockDemp = vi.mocked(dempSignaal);
const mockTaak = vi.mocked(maakVoorbereidingstaak);
const mockHerinner = vi.mocked(herinnerMorgen);

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/werk/voorbereiding/actie", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GELDIGE_BASIS = { eventId: "evt1", eventStart: "2026-08-19T09:00:00Z", eventTitel: "Training" };

beforeEach(() => {
  mockVerify.mockReset();
  mockDemp.mockReset().mockResolvedValue(undefined);
  mockTaak.mockReset().mockResolvedValue({ taakId: 42 });
  mockHerinner.mockReset().mockResolvedValue({ taakId: 43 });
});

describe("POST /api/werk/voorbereiding/actie", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest({ actie: "dempen", ...GELDIGE_BASIS }));
    expect(response.status).toBe(403);
    expect(mockDemp).not.toHaveBeenCalled();
  });

  it("weigert een onbekende actie met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ actie: "iets-anders", ...GELDIGE_BASIS }));
    expect(response.status).toBe(400);
  });

  it("weigert ontbrekende verplichte velden met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ actie: "dempen", eventId: "evt1" }));
    expect(response.status).toBe(400);
  });

  it("'dempen' roept dempSignaal aan, geen datum nodig", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ actie: "dempen", ...GELDIGE_BASIS }));

    expect(response.status).toBe(200);
    expect(mockDemp).toHaveBeenCalledWith(expect.anything(), 7, expect.objectContaining({ eventId: "evt1" }));
  });

  it("'taak' vereist een geldige datum en geeft het taakId terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });

    const zonderDatum = await POST(maakRequest({ actie: "taak", ...GELDIGE_BASIS }));
    expect(zonderDatum.status).toBe(400);

    const metDatum = await POST(maakRequest({ actie: "taak", ...GELDIGE_BASIS, datum: "2026-08-17" }));
    const data = await metDatum.json();
    expect(metDatum.status).toBe(200);
    expect(data.taakId).toBe(42);
    expect(mockTaak).toHaveBeenCalledWith(expect.anything(), 7, expect.anything(), "2026-08-17", {
      titel: undefined,
      beschrijving: undefined,
    });
  });

  it("'taak' geeft een titel-/beschrijving-override door (geaccepteerd AI-voorstel)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    await POST(
      maakRequest({ actie: "taak", ...GELDIGE_BASIS, datum: "2026-08-17", taakTitel: "AI-titel", taakBeschrijving: "AI-tekst" })
    );

    expect(mockTaak).toHaveBeenCalledWith(expect.anything(), 7, expect.anything(), "2026-08-17", {
      titel: "AI-titel",
      beschrijving: "AI-tekst",
    });
  });

  it("'herinner_morgen' roept herinnerMorgen aan met de meegegeven datum", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ actie: "herinner_morgen", ...GELDIGE_BASIS, datum: "2026-08-18" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.taakId).toBe(43);
    expect(mockHerinner).toHaveBeenCalledWith(expect.anything(), 7, expect.anything(), "2026-08-18");
  });

  it("geeft een generieke 500-fout terug wanneer de actie faalt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockDemp.mockRejectedValue(new Error("interne details die niet mogen lekken"));

    const response = await POST(maakRequest({ actie: "dempen", ...GELDIGE_BASIS }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("interne details");
  });
});
