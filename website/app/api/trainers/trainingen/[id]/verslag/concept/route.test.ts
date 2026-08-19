import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { upsertConcept } from "@/lib/trainers/verslag";
import type { AuthTrainer } from "@/lib/trainers/auth";

// Traineromgeving V1, Ronde 3 (2026-08-24) — dekt de HTTP-laag van
// POST .../verslag/concept. upsertConcept zelf (ownership/opslaglogica) is
// al gedekt in lib/trainers/verslag.test.ts — deze route-tests bewaken
// uitsluitend sessieverificatie, validatie, rate limiting en
// uitkomst-vertaling, zelfde mockpatroon als app/api/trainers/trainingen/
// [id]/route.test.ts.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/verslag", () => ({ upsertConcept: vi.fn() }));

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockUpsertConcept = vi.mocked(upsertConcept);

function maakTrainer(id: number): AuthTrainer {
  return { id, name: "Wessel", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
}

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers/trainingen/700/verslag/concept", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function roep(body: unknown, id = "700") {
  return POST(maakRequest(body), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockUpsertConcept.mockReset();
});

describe("POST .../verslag/concept — sessie", () => {
  it("weigert zonder geldige trainersessie met 401, roept upsertConcept nooit aan", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await roep({ trainerInvoer: "Notities" });
    expect(response.status).toBe(401);
    expect(mockUpsertConcept).not.toHaveBeenCalled();
  });
});

describe("POST .../verslag/concept — validatie", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(101), cookieAanwezig: true });
  });

  it("400 bij ongeldige JSON", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/trainers/trainingen/700/verslag/concept", {
        method: "POST",
        body: "{niet geldig",
        headers: { Cookie: "payload-token=geldig" },
      }),
      { params: Promise.resolve({ id: "700" }) }
    );
    expect(response.status).toBe(400);
  });

  it("400 wanneer noch trainerInvoer noch definitieveTekst is opgegeven", async () => {
    expect((await roep({})).status).toBe(400);
  });

  it("400 bij een niet-string trainerInvoer", async () => {
    expect((await roep({ trainerInvoer: 123 })).status).toBe(400);
  });

  it("geeft trainerInvoer/definitieveTekst exact door aan upsertConcept", async () => {
    mockUpsertConcept.mockResolvedValue({ soort: "ok", verslag: { id: 1, status: "concept" } as never });
    await roep({ trainerInvoer: "Notities", definitieveTekst: "Voorstel" }, "700");
    expect(mockUpsertConcept).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 101 }), "700", { trainerInvoer: "Notities", definitieveTekst: "Voorstel" });
  });
});

describe("POST .../verslag/concept — uitkomst-vertaling", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(102), cookieAanwezig: true });
  });

  it("niet_gevonden -> 404 (nooit 403)", async () => {
    mockUpsertConcept.mockResolvedValue({ soort: "niet_gevonden" });
    expect((await roep({ trainerInvoer: "x" })).status).toBe(404);
  });

  it("niet_bewerkbaar -> 422 met de boodschap uit verslag.ts", async () => {
    mockUpsertConcept.mockResolvedValue({ soort: "niet_bewerkbaar", boodschap: "Geen trainerboard-item." });
    const response = await roep({ trainerInvoer: "x" });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Geen trainerboard-item.");
  });

  it("ok -> 200 met de verslagrij", async () => {
    const verslag = { id: 1, status: "concept", trainerInvoer: "x" };
    mockUpsertConcept.mockResolvedValue({ soort: "ok", verslag: verslag as never });
    const response = await roep({ trainerInvoer: "x" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verslag });
  });

  it("een onverwachte fout levert 500 op", async () => {
    mockUpsertConcept.mockRejectedValue(new Error("db weg"));
    expect((await roep({ trainerInvoer: "x" })).status).toBe(500);
  });
});

describe("POST .../verslag/concept — rate limiting", () => {
  it("429 na te veel aanvragen van dezelfde trainer binnen het venster", async () => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(9001), cookieAanwezig: true });
    mockUpsertConcept.mockResolvedValue({ soort: "niet_gevonden" });

    let laatsteStatus = 200;
    for (let i = 0; i < 65; i++) {
      laatsteStatus = (await roep({ trainerInvoer: "x" })).status;
    }
    expect(laatsteStatus).toBe(429);
  });
});
