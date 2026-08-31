import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { wijzigAanvullendeTraining } from "@/lib/trainers/aanvullende-trainingen";
import type { AuthTrainer } from "@/lib/trainers/auth";

// Productiecheck-bugfix (2026-08-31, bug 1) — dekt de HTTP-laag van
// PATCH .../aanvullende-trainingen/[id]. wijzigAanvullendeTraining zelf
// (ownership/opslaglogica) is al gedekt in lib/trainers/aanvullende-
// trainingen.test.ts — zelfde scheiding als app/api/trainers/trainingen/
// [id]/verslag/concept/route.test.ts.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/aanvullende-trainingen", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/aanvullende-trainingen")>();
  return { ...echt, wijzigAanvullendeTraining: vi.fn() };
});

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockWijzig = vi.mocked(wijzigAanvullendeTraining);

function maakTrainer(id: number): AuthTrainer {
  return { id, name: "Wessel", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
}

function roep(body: unknown, id = "10") {
  return PATCH(
    new NextRequest("http://localhost:3000/api/trainers/scholen/500/aanvullende-trainingen/10", {
      method: "PATCH",
      headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  mockVerify.mockReset();
  mockWijzig.mockReset();
});

describe("PATCH .../aanvullende-trainingen/[id] — sessie", () => {
  it("weigert zonder geldige trainersessie met 401, roept wijzigAanvullendeTraining nooit aan", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await roep({ naam: "x", datum: "2026-09-10" });
    expect(response.status).toBe(401);
    expect(mockWijzig).not.toHaveBeenCalled();
  });
});

describe("PATCH .../aanvullende-trainingen/[id] — validatie", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(101), cookieAanwezig: true });
  });

  it("400 bij een ongeldig (niet-numeriek) ID", async () => {
    const response = await roep({ naam: "x", datum: "2026-09-10" }, "aanvullend:10");
    expect(response.status).toBe(400);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("400 bij ongeldige JSON", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/trainers/scholen/500/aanvullende-trainingen/10", { method: "PATCH", body: "{niet geldig", headers: { Cookie: "payload-token=geldig" } }),
      { params: Promise.resolve({ id: "10" }) }
    );
    expect(response.status).toBe(400);
  });

  it("400 wanneer naam of datum ontbreekt", async () => {
    expect((await roep({ naam: "x" })).status).toBe(400);
    expect((await roep({ datum: "2026-09-10" })).status).toBe(400);
  });

  it("geeft het numerieke ID en de body exact door aan wijzigAanvullendeTraining", async () => {
    mockWijzig.mockResolvedValue({ soort: "ok", training: { id: 10, naam: "x", datum: "2026-09-10", mondaySchoolId: "500", schoolNaam: "School" } });
    await roep({ naam: "Coachgesprek taal", datum: "2026-09-17" }, "10");
    expect(mockWijzig).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 101 }), 10, { naam: "Coachgesprek taal", datum: "2026-09-17" });
  });
});

describe("PATCH .../aanvullende-trainingen/[id] — uitkomst-vertaling", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(102), cookieAanwezig: true });
  });

  it("niet_gevonden -> 404 (nooit 403, anti-enumeratie)", async () => {
    mockWijzig.mockResolvedValue({ soort: "niet_gevonden" });
    expect((await roep({ naam: "x", datum: "2026-09-10" })).status).toBe(404);
  });

  it("ongeldige_invoer -> 422 met de boodschap uit aanvullende-trainingen.ts", async () => {
    mockWijzig.mockResolvedValue({ soort: "ongeldige_invoer", boodschap: "Vul een trainingnaam in." });
    const response = await roep({ naam: "x", datum: "2026-09-10" });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Vul een trainingnaam in.");
  });

  it("ok -> 200 met de bijgewerkte training", async () => {
    const training = { id: 10, naam: "Coachgesprek taal", datum: "2026-09-17", mondaySchoolId: "500", schoolNaam: "School" };
    mockWijzig.mockResolvedValue({ soort: "ok", training });
    const response = await roep({ naam: "Coachgesprek taal", datum: "2026-09-17" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ training });
  });

  it("een onverwachte fout levert 500 op", async () => {
    mockWijzig.mockRejectedValue(new Error("db weg"));
    expect((await roep({ naam: "x", datum: "2026-09-10" })).status).toBe(500);
  });
});

describe("PATCH .../aanvullende-trainingen/[id] — rate limiting", () => {
  it("429 na te veel aanvragen van dezelfde trainer binnen het venster", async () => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(9003), cookieAanwezig: true });
    mockWijzig.mockResolvedValue({ soort: "niet_gevonden" });

    let laatsteStatus = 200;
    for (let i = 0; i < 25; i++) {
      laatsteStatus = (await roep({ naam: "x", datum: "2026-09-10" })).status;
    }
    expect(laatsteStatus).toBe(429);
  });
});
