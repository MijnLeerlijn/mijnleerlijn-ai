import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";

// jwtVerify wordt hier gemockt (niet met echte jose-crypto getest) — deze
// combinatie van jsdom-testomgeving (vitest.config.ts) en jose's interne
// Uint8Array-realmcontrole ("payload must be an instance of Uint8Array")
// blijkt tijdens dit werk incompatibel zodra een test zelf een JWT
// ondertekent (SignJWT), ook al werkt exact dezelfde code prima in een
// gewoon Node-script — dit was nooit eerder blootgelegd omdat elke
// bestaande route-test verifyAdminSessionCookie zelf al mockt i.p.v. een
// echt token te ondertekenen. Het mocken hier isoleert bovendien precies
// wat dit bestand zelf toevoegt (de collection-claim-/sessie-/actief-
// controles) van jose's eigen, elders al bewezen crypto-correctheid.
const mockJwtVerify = vi.fn();
vi.mock("jose", () => ({ jwtVerify: (...args: unknown[]) => mockJwtVerify(...args) }));

const { verifyTrainerSessionCookie } = await import("./auth");

function maakPayloadMock(findByID: ReturnType<typeof vi.fn>) {
  return { secret: "test-secret", findByID } as unknown as Payload;
}

beforeEach(() => {
  mockJwtVerify.mockReset();
});

describe("verifyTrainerSessionCookie", () => {
  it("wijst een ontbrekend cookie af zonder jwtVerify aan te roepen", async () => {
    const result = await verifyTrainerSessionCookie(maakPayloadMock(vi.fn()), undefined);
    expect(result).toEqual({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("geeft geen-cookie ook terug voor een lege string (defensief, niet alleen undefined)", async () => {
    const result = await verifyTrainerSessionCookie(maakPayloadMock(vi.fn()), "");
    expect(result).toEqual({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
  });

  it("wijst een ongeldig/verlopen token af (jwtVerify gooit)", async () => {
    mockJwtVerify.mockRejectedValue(new Error("signature verification failed"));
    const result = await verifyTrainerSessionCookie(maakPayloadMock(vi.fn()), "kapot.token.hier");
    expect(result.trainer).toBeNull();
    expect(result.cookieAanwezig).toBe(true);
    expect(result.reden).toBe("ongeldig-token");
  });

  it("KERNTEST: een geldig ondertekend 'users'-token (admin/editor-sessie) wordt nooit als trainersessie geaccepteerd", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { id: 1, collection: "users", sid: "s1" } });
    const findByID = vi.fn();

    const result = await verifyTrainerSessionCookie(maakPayloadMock(findByID), "geldig-users-token");

    expect(result.trainer).toBeNull();
    expect(result.reden).toBe("verkeerde-collectie");
    expect(findByID).not.toHaveBeenCalled();
  });

  it("accepteert een geldig 'trainer-accounts'-token met actieve sessie en een actief account", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { id: 5, collection: "trainer-accounts", sid: "sessie-1" } });
    const findByID = vi.fn().mockResolvedValue({
      id: 5,
      name: "Wessel",
      email: "wessel@mijnleerlijn.nl",
      mondayTrainerboardId: "18424768045",
      mondayUitvoerderItemId: "18420999001",
      actief: true,
      sessions: [{ id: "sessie-1" }],
    });

    const result = await verifyTrainerSessionCookie(maakPayloadMock(findByID), "geldig-trainers-token");

    expect(result).toEqual({
      trainer: {
        id: 5,
        name: "Wessel",
        email: "wessel@mijnleerlijn.nl",
        mondayTrainerboardId: "18424768045",
        mondayUitvoerderItemId: "18420999001",
        actief: true,
      },
      cookieAanwezig: true,
    });
    expect(findByID).toHaveBeenCalledWith({ collection: "trainer-accounts", id: 5, overrideAccess: true, depth: 0 });
  });

  it("wijst af wanneer de sessie niet (meer) in trainer.sessions voorkomt (bv. elders uitgelogd)", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { id: 5, collection: "trainer-accounts", sid: "verlopen-sessie" } });
    const findByID = vi.fn().mockResolvedValue({ id: 5, actief: true, sessions: [{ id: "andere-sessie" }] });

    const result = await verifyTrainerSessionCookie(maakPayloadMock(findByID), "token");
    expect(result.trainer).toBeNull();
    expect(result.reden).toBe("sessie-niet-actief");
  });

  it("wijst af wanneer het token geen sid draagt, ook al bestaat er wel een sessies-array", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { id: 5, collection: "trainer-accounts" } });
    const findByID = vi.fn().mockResolvedValue({ id: 5, actief: true, sessions: [{ id: "sessie-1" }] });

    const result = await verifyTrainerSessionCookie(maakPayloadMock(findByID), "token");
    expect(result.trainer).toBeNull();
    expect(result.reden).toBe("sessie-niet-actief");
  });

  it("wijst een inactief trainersaccount af, ook met een verder geldige sessie", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { id: 5, collection: "trainer-accounts", sid: "sessie-1" } });
    const findByID = vi.fn().mockResolvedValue({ id: 5, actief: false, sessions: [{ id: "sessie-1" }] });

    const result = await verifyTrainerSessionCookie(maakPayloadMock(findByID), "token");
    expect(result.trainer).toBeNull();
    expect(result.reden).toBe("trainer-inactief");
  });

  it("geeft trainer-niet-gevonden terug wanneer het account niet meer bestaat", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { id: 999, collection: "trainer-accounts", sid: "s1" } });
    const findByID = vi.fn().mockResolvedValue(null);

    const result = await verifyTrainerSessionCookie(maakPayloadMock(findByID), "token");
    expect(result.trainer).toBeNull();
    expect(result.reden).toBe("trainer-niet-gevonden");
  });
});
