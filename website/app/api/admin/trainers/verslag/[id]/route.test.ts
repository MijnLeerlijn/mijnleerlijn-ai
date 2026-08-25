import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH, DELETE } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { wijzigVerslagAlsAdmin, verwijderVerslagAlsAdmin } from "@/lib/trainers/verslag";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/verslag", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/verslag")>();
  return { ...echt, wijzigVerslagAlsAdmin: vi.fn(), verwijderVerslagAlsAdmin: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockWijzig = vi.mocked(wijzigVerslagAlsAdmin);
const mockVerwijder = vi.mocked(verwijderVerslagAlsAdmin);

function maakRequest(method: "PATCH" | "DELETE", body?: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/trainers/verslag/1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const PARAMS = { params: Promise.resolve({ id: "1" }) };

beforeEach(() => {
  mockVerify.mockReset();
  mockWijzig.mockReset();
  mockVerwijder.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("PATCH /api/admin/trainers/verslag/[id] — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie (dekt ook unauthenticated + trainercookie: verifyAdminSessionCookie accepteert alleen admin-sessiecookies)", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await PATCH(maakRequest("PATCH", { definitieveTekst: "Tekst." }), PARAMS);
    expect(response.status).toBe(403);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("weigert een niet-editor/admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "trainer" as never }, cookieAanwezig: true });
    const response = await PATCH(maakRequest("PATCH", { definitieveTekst: "Tekst." }), PARAMS);
    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/admin/trainers/verslag/[id] — inhoud", () => {
  it("geeft 400 bij een ongeldig verslag-ID", async () => {
    const response = await PATCH(maakRequest("PATCH", { definitieveTekst: "Tekst." }), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(400);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("geeft 400 als definitieveTekst geen string is", async () => {
    const response = await PATCH(maakRequest("PATCH", { definitieveTekst: 123 }), PARAMS);
    expect(response.status).toBe(400);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("wijzigt de tekst voor een geldige aanvraag — school/trainer/training kunnen niet via de body worden meegestuurd (bestaan niet als velden)", async () => {
    mockWijzig.mockResolvedValue({ soort: "ok", verslag: { id: 1, definitieveTekst: "Nieuwe tekst." } as never });
    const response = await PATCH(maakRequest("PATCH", { definitieveTekst: "Nieuwe tekst.", trainer: 999, schoolNaam: "Andere school" }), PARAMS);
    expect(response.status).toBe(200);
    expect(mockWijzig).toHaveBeenCalledWith(expect.anything(), 1, { definitieveTekst: "Nieuwe tekst." });
  });

  it("geeft 404 als het verslag niet bestaat", async () => {
    mockWijzig.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await PATCH(maakRequest("PATCH", { definitieveTekst: "Tekst." }), PARAMS);
    expect(response.status).toBe(404);
  });

  it("geeft 422 bij ongeldige invoer", async () => {
    mockWijzig.mockResolvedValue({ soort: "ongeldige_invoer", boodschap: "Vul een verslagtekst in." });
    const response = await PATCH(maakRequest("PATCH", { definitieveTekst: "" }), PARAMS);
    expect(response.status).toBe(422);
  });
});

describe("DELETE /api/admin/trainers/verslag/[id] — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await DELETE(maakRequest("DELETE"), PARAMS);
    expect(response.status).toBe(403);
    expect(mockVerwijder).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/trainers/verslag/[id] — inhoud", () => {
  it("geeft 400 bij een ongeldig verslag-ID", async () => {
    const response = await DELETE(maakRequest("DELETE"), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(400);
  });

  it("verwijdert het verslag voor een geldige aanvraag", async () => {
    mockVerwijder.mockResolvedValue("verwijderd");
    const response = await DELETE(maakRequest("DELETE"), PARAMS);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("geeft 404 als het verslag niet bestaat", async () => {
    mockVerwijder.mockResolvedValue("niet_gevonden");
    const response = await DELETE(maakRequest("DELETE"), PARAMS);
    expect(response.status).toBe(404);
  });
});
