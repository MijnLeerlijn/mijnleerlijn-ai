import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH, DELETE } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { wijzigLogboekItemAlsAdmin, verwijderLogboekItemAlsAdmin } from "@/lib/trainers/logboek";

// Correctieronde Admin Traineromgeving (2026-08-25, spec §2/§7) — dekt
// uitsluitend de HTTP-laag (rechten/validatie/statuscodes/uitkomst-
// vertaling), zelfde opzet als app/api/admin/trainers/detail/route.test.ts.
// De eigenlijke opslag-/eigendomslogica heeft al eigen dekking in
// lib/trainers/logboek.test.ts.
//
// Admin-auth via verifyAdminSessionCookie (nooit verifyTrainerSessionCookie)
// is de enige poort hier — "unauthenticated geen toegang" EN "traineraccount
// geen admin-update/delete" zijn dus BEIDE al gedekt door de "geen geldige
// sessie"-tests hieronder: een traineraccount-cookie (andere JWT-collection-
// claim, zie lib/trainers/auth.ts) verifieert domweg nooit als een geldige
// admin-sessie via verifyAdminSessionCookie — er bestaat geen apart codepad
// dat een trainer-token hier zou kunnen accepteren.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/logboek", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/logboek")>();
  return { ...echt, wijzigLogboekItemAlsAdmin: vi.fn(), verwijderLogboekItemAlsAdmin: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockWijzig = vi.mocked(wijzigLogboekItemAlsAdmin);
const mockVerwijder = vi.mocked(verwijderLogboekItemAlsAdmin);

function maakRequest(method: "PATCH" | "DELETE", body?: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/trainers/logboek/1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockVerify.mockReset();
  mockWijzig.mockReset();
  mockVerwijder.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("PATCH /api/admin/trainers/logboek/[id]", () => {
  it("weigert zonder geldige admin-sessie (403) — dekt zowel unauthenticated als een traineraccount-sessie (andere collection-claim, zie lib/trainers/auth.ts)", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await PATCH(maakRequest("PATCH", { tekst: "Nieuw." }), params("1"));
    expect(response.status).toBe(403);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("geeft 400 bij een niet-numeriek ID", async () => {
    const response = await PATCH(maakRequest("PATCH", { tekst: "Nieuw." }), params("abc"));
    expect(response.status).toBe(400);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("geeft 400 bij een ongeldig type in de body", async () => {
    const response = await PATCH(maakRequest("PATCH", { type: "onbestaand-type" }), params("1"));
    expect(response.status).toBe(400);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("slaat een geldige wijziging op en geeft het bijgewerkte item terug", async () => {
    mockWijzig.mockResolvedValue({ soort: "ok", item: { id: 1, mondaySchoolId: "500", schoolNaam: "School A", type: "helpdesk", occurredAt: "2026-08-20T10:00:00.000Z", tekst: "Nieuw.", createdAt: "2026-08-19T00:00:00.000Z", mondayUpdateStatus: "niet_verzonden" } });
    const response = await PATCH(maakRequest("PATCH", { type: "helpdesk", tekst: "Nieuw." }), params("1"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.item.tekst).toBe("Nieuw.");
    expect(mockWijzig).toHaveBeenCalledWith(expect.anything(), 1, { type: "helpdesk", occurredAt: undefined, tekst: "Nieuw." });
  });

  it("trainer/school-ID's in de request-body worden genegeerd — kunnen nooit worden ombogen (er bestaat geen invoerveld ervoor)", async () => {
    mockWijzig.mockResolvedValue({ soort: "ok", item: { id: 1, mondaySchoolId: "500", schoolNaam: "School A", type: "notitie", occurredAt: "2026-08-20T10:00:00.000Z", tekst: "Tekst.", createdAt: "2026-08-19T00:00:00.000Z", mondayUpdateStatus: "niet_verzonden" } });
    await PATCH(maakRequest("PATCH", { tekst: "Tekst.", trainer: 999, mondaySchoolId: "andere-school", schoolNaam: "Andere school" }), params("1"));
    // De aanroep naar de servicelaag bevat uitsluitend type/occurredAt/tekst — geen trainer/mondaySchoolId, ongeacht wat de body meestuurt.
    expect(mockWijzig).toHaveBeenCalledWith(expect.anything(), 1, { type: undefined, occurredAt: undefined, tekst: "Tekst." });
  });

  it("geeft 404 terug wanneer het logboekitem niet bestaat (of geen handmatig item is)", async () => {
    mockWijzig.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await PATCH(maakRequest("PATCH", { tekst: "Poging." }), params("999999"));
    expect(response.status).toBe(404);
  });

  it("geeft 422 terug bij ongeldige invoer (bv. lege tekst)", async () => {
    mockWijzig.mockResolvedValue({ soort: "ongeldige_invoer", boodschap: "Vul een notitie in." });
    const response = await PATCH(maakRequest("PATCH", { tekst: "   " }), params("1"));
    expect(response.status).toBe(422);
  });
});

describe("DELETE /api/admin/trainers/logboek/[id]", () => {
  it("weigert zonder geldige admin-sessie (403)", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await DELETE(maakRequest("DELETE"), params("1"));
    expect(response.status).toBe(403);
    expect(mockVerwijder).not.toHaveBeenCalled();
  });

  it("geeft 400 bij een niet-numeriek ID", async () => {
    const response = await DELETE(maakRequest("DELETE"), params("abc"));
    expect(response.status).toBe(400);
    expect(mockVerwijder).not.toHaveBeenCalled();
  });

  it("verwijdert een geldig logboekitem", async () => {
    mockVerwijder.mockResolvedValue("verwijderd");
    const response = await DELETE(maakRequest("DELETE"), params("1"));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });

  it("geeft 404 terug wanneer het logboekitem niet bestaat (of geen handmatig item is)", async () => {
    mockVerwijder.mockResolvedValue("niet_gevonden");
    const response = await DELETE(maakRequest("DELETE"), params("999999"));
    expect(response.status).toBe(404);
  });
});
