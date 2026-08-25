import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH, DELETE } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verwijderTrainerAccountAlsAdmin, zetTrainerActiefStatus } from "@/lib/trainers/trainer-account";

// Admin volledig traineraccountbeheer (vervolgronde) — deze route is bewust
// isAdmin, NIET isEditor (zie route.ts se toelichting: TrainerAccounts.ts se
// EIGEN, al bestaande access-blok is adminOnly voor read/update/delete,
// strenger dan de isEditor-grens die de rest van /admin/trainers/* gebruikt
// voor verslag-/logboekmutaties). Deze tests bewijzen expliciet dat een
// editor (niet-admin) hier NIET doorheen komt, in tegenstelling tot bv.
// app/api/admin/trainers/logboek/[id]/route.test.ts.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/trainer-account", () => ({ verwijderTrainerAccountAlsAdmin: vi.fn(), zetTrainerActiefStatus: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockVerwijder = vi.mocked(verwijderTrainerAccountAlsAdmin);
const mockZetActief = vi.mocked(zetTrainerActiefStatus);

function maakRequest(method: "PATCH" | "DELETE", body?: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/trainers/account/1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const PARAMS = { params: Promise.resolve({ id: "1" }) };

beforeEach(() => {
  mockVerify.mockReset();
  mockVerwijder.mockReset();
  mockZetActief.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
});

describe("PATCH /api/admin/trainers/account/[id] — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await PATCH(maakRequest("PATCH", { actief: false }), PARAMS);
    expect(response.status).toBe(403);
    expect(mockZetActief).not.toHaveBeenCalled();
  });

  it("weigert een editor (niet-admin) met 403 — deze route is bewust strenger dan isEditor", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    const response = await PATCH(maakRequest("PATCH", { actief: false }), PARAMS);
    expect(response.status).toBe(403);
    expect(mockZetActief).not.toHaveBeenCalled();
  });

  it("geeft 400 bij een ongeldig trainer-ID", async () => {
    const response = await PATCH(maakRequest("PATCH", { actief: false }), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(400);
  });

  it("geeft 400 als actief geen boolean is", async () => {
    const response = await PATCH(maakRequest("PATCH", { actief: "nee" }), PARAMS);
    expect(response.status).toBe(400);
    expect(mockZetActief).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/trainers/account/[id] — inhoud", () => {
  it("zet actief op false voor een admin", async () => {
    mockZetActief.mockResolvedValue({ soort: "ok", actief: false });
    const response = await PATCH(maakRequest("PATCH", { actief: false }), PARAMS);
    expect(response.status).toBe(200);
    expect(mockZetActief).toHaveBeenCalledWith(expect.anything(), 1, false);
    expect(await response.json()).toEqual({ actief: false });
  });

  it("geeft 404 als de trainer niet bestaat", async () => {
    mockZetActief.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await PATCH(maakRequest("PATCH", { actief: true }), PARAMS);
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/admin/trainers/account/[id] — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await DELETE(maakRequest("DELETE"), PARAMS);
    expect(response.status).toBe(403);
    expect(mockVerwijder).not.toHaveBeenCalled();
  });

  it("weigert een editor (niet-admin) met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    const response = await DELETE(maakRequest("DELETE"), PARAMS);
    expect(response.status).toBe(403);
    expect(mockVerwijder).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/trainers/account/[id] — inhoud", () => {
  it("verwijdert het account voor een admin zonder gerelateerde historie", async () => {
    mockVerwijder.mockResolvedValue({ soort: "verwijderd" });
    const response = await DELETE(maakRequest("DELETE"), PARAMS);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("geeft 404 als de trainer niet bestaat", async () => {
    mockVerwijder.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await DELETE(maakRequest("DELETE"), PARAMS);
    expect(response.status).toBe(404);
  });

  it("geeft 409 met een duidelijke melding als er nog gerelateerde historie bestaat, en verwijdert niets", async () => {
    mockVerwijder.mockResolvedValue({ soort: "heeft_relaties", relaties: [{ label: "trainingsverslagen", aantal: 3 }] });
    const response = await DELETE(maakRequest("DELETE"), PARAMS);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("3 trainingsverslagen");
    expect(body.error).toContain("inactief");
  });
});
