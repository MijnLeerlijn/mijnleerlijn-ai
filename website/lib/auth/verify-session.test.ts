import { describe, it, expect, vi } from "vitest";
import type { Payload } from "payload";

// Traineromgeving V1, Ronde 1 (2026-08-19) — verifyAdminSessionCookie() had
// tot nu toe geen eigen testbestand (wél al maanden in productie, via
// meerdere API-routes). De Traineromgeving maakt de shared-cookiename-
// architectuur (payload-token, cookiePrefix is GLOBAAL — zie
// lib/trainers/auth.ts) voor het eerst concreet gevaarlijk in de omgekeerde
// richting: kan een trainerssessie zich voordoen als een beheerderssessie?
// Deze test bewijst het antwoord (nee) — de KERNTEST-tegenhanger van
// lib/trainers/auth.test.ts se "verkeerde-collectie"-test, nu vanuit de
// admin-kant. Zelfde jose-mockaanpak als lib/trainers/auth.test.ts (een
// echt SignJWT-token signeren breekt in deze Vitest/jsdom-omgeving — zie de
// toelichting daar).
const mockJwtVerify = vi.fn();
vi.mock("jose", () => ({ jwtVerify: (...args: unknown[]) => mockJwtVerify(...args) }));

describe("verifyAdminSessionCookie — een trainers-sessie is geen adminsessie", () => {
  it("wijst een geldig ondertekend token met collection:'trainers' af, zonder payload.findByID aan te roepen", async () => {
    const { verifyAdminSessionCookie } = await import("./verify-session");

    mockJwtVerify.mockResolvedValue({
      payload: { id: 1, collection: "trainers", sid: "sessie-1", exp: 9999999999 },
    });
    const findByID = vi.fn();
    const payload = { secret: "test-secret", findByID } as unknown as Payload;

    const resultaat = await verifyAdminSessionCookie(payload, "een-geldig-ondertekend-trainers-token");

    expect(resultaat).toEqual({ user: null, cookieAanwezig: true, reden: "verkeerde-collectie" });
    expect(findByID).not.toHaveBeenCalled();
  });
});
