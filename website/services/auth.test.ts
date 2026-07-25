import { describe, it, expect, vi, beforeEach } from "vitest";
import { haalSessieOp } from "./auth";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Regressietest voor de livegang-blokkade gevonden op 2026-07-25:
// haalSessieOp() riep eerder rechtstreeks payload.auth({headers}) aan, wat
// dezelfde Origin/CSRF-afhankelijke poort raakt als destijds al gevonden en
// gefixt voor de POST-routes (zie het commentaar in lib/auth/verify-session.ts)
// — met een overigens geldige sessiecookie gaf dit non-deterministisch wel/
// geen gebruiker terug. Fix: dezelfde geverifieerde verifyAdminSessionCookie()
// gebruiken als elke andere eigen route. Dit bestand test uitsluitend DIE
// verbinding (cookie lezen → verifyAdminSessionCookie aanroepen → Sessie
// teruggeven) — de cryptografische verificatie zelf wordt al gedekt door de
// bestaande tests rond verify-session.ts se aanroepers.
vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ secret: "test" }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);

async function stelCookieIn(token: string | undefined) {
  const { cookies } = await import("next/headers");
  vi.mocked(cookies).mockResolvedValue({
    get: (naam: string) => (naam === PAYLOAD_SESSION_COOKIE_NAME && token ? { value: token } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  mockVerify.mockReset();
});

describe("haalSessieOp", () => {
  it("geeft null terug zonder sessiecookie, zonder verifyAdminSessionCookie zelfs aan te roepen met een token", async () => {
    await stelCookieIn(undefined);
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const sessie = await haalSessieOp();

    expect(sessie).toBeNull();
    expect(mockVerify).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it("geeft null terug bij een ongeldige/verlopen sessiecookie", async () => {
    await stelCookieIn("een-ongeldig-token");
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: true, reden: "ongeldig-token" });

    const sessie = await haalSessieOp();

    expect(sessie).toBeNull();
  });

  it("geeft de sessie terug bij een geldige sessiecookie (gebruikt verifyAdminSessionCookie, niet payload.auth())", async () => {
    await stelCookieIn("een-geldig-token");
    mockVerify.mockResolvedValue({
      user: { id: 1, role: "admin", name: "Beheerder" } as never,
      cookieAanwezig: true,
    });

    const sessie = await haalSessieOp();

    expect(sessie).toEqual({ gebruikerId: "1", naam: "Beheerder", rol: "admin" });
    expect(mockVerify).toHaveBeenCalledWith(expect.anything(), "een-geldig-token");
  });

  it("werkt ook voor een editor-rol", async () => {
    await stelCookieIn("een-geldig-token");
    mockVerify.mockResolvedValue({
      user: { id: 2, role: "editor", name: "Redacteur" } as never,
      cookieAanwezig: true,
    });

    const sessie = await haalSessieOp();

    expect(sessie).toEqual({ gebruikerId: "2", naam: "Redacteur", rol: "editor" });
  });
});
