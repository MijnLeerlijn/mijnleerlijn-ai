import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { werkTrainingBij } from "@/lib/trainers/writeback";
import type { AuthTrainer } from "@/lib/trainers/auth";

// Traineromgeving V1, Ronde 2 (2026-08-19) — dekt de eerste trainer-facing
// API-route in dit project. Zelfde mockpatroon als app/api/trainers-
// diagnose/monday/item-board/route.test.ts (payload/payload.config kaal
// gemockt, de echte auth-/logica-functie los gemockt). werkTrainingBij zelf
// wordt hier gemockt — de eigen orchestratie-/conflict-/deelmislukkingslogica
// is al gedekt in lib/trainers/writeback.test.ts; deze route-tests bewaken
// uitsluitend de HTTP-laag: sessieverificatie, validatie, rate limiting, en
// de vertaling van TrainingMutatieUitkomst naar de juiste HTTP-status.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/writeback", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/writeback")>();
  return { ...echt, werkTrainingBij: vi.fn() };
});

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockWerkBij = vi.mocked(werkTrainingBij);

function maakTrainer(id: number): AuthTrainer {
  return { id, name: "Wessel", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "999001", actief: true };
}

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers/trainingen/700", {
    method: "PATCH",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function roep(body: unknown, id = "700") {
  return PATCH(maakRequest(body), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockWerkBij.mockReset();
});

describe("PATCH /api/trainers/trainingen/[id] — sessie", () => {
  it("weigert zonder geldige trainersessie met 401, roept werkTrainingBij nooit aan", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await roep({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(response.status).toBe(401);
    expect(mockWerkBij).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/trainers/trainingen/[id] — validatie", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(101), cookieAanwezig: true });
  });

  it("400 bij ongeldige JSON", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/trainers/trainingen/700", { method: "PATCH", body: "{niet geldig", headers: { Cookie: "payload-token=geldig" } }),
      { params: Promise.resolve({ id: "700" }) }
    );
    expect(response.status).toBe(400);
  });

  it("400 wanneer noch datum noch status is opgegeven", async () => {
    expect((await roep({})).status).toBe(400);
  });

  it("400 bij een ongeldige datumvorm", async () => {
    expect((await roep({ datum: { nieuweWaarde: "20 augustus", verwachteHuidigeWaarde: null } })).status).toBe(400);
  });

  it("accepteert nieuweWaarde: null voor datum (verwijderen) als geldig", async () => {
    mockWerkBij.mockResolvedValue({ soort: "resultaat", resultaat: { kolomResultaten: [], algeheleStatus: "volledig_geslaagd", opnieuwProberen: { trainerboard: false, centraal: false } } });
    expect((await roep({ datum: { nieuweWaarde: null, verwachteHuidigeWaarde: "2026-09-01" } })).status).toBe(200);
  });

  it("400 bij een onbekende statuswaarde", async () => {
    expect((await roep({ status: { nieuweWaarde: "onbestaand", verwachteHuidigeRuweTekst: null } })).status).toBe(400);
  });

  it("400 bij een ongeldige alleenRecord-waarde", async () => {
    expect((await roep({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null }, alleenRecord: "iets-anders" })).status).toBe(400);
  });

  it("geeft het gevalideerde verzoek exact door aan werkTrainingBij (geen extra/losse velden)", async () => {
    mockWerkBij.mockResolvedValue({ soort: "resultaat", resultaat: { kolomResultaten: [], algeheleStatus: "volledig_geslaagd", opnieuwProberen: { trainerboard: false, centraal: false } } });
    await roep({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: "Gepland" }, alleenRecord: "centraal" }, "700");
    expect(mockWerkBij).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 101 }),
      "700",
      { status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: "Gepland" }, alleenRecord: "centraal" }
    );
  });
});

describe("PATCH /api/trainers/trainingen/[id] — uitkomst-vertaling", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(102), cookieAanwezig: true });
  });

  it("niet_gevonden -> 404 (nooit 403 — verklapt geen bestaan van andermans training)", async () => {
    mockWerkBij.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await roep({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(response.status).toBe(404);
  });

  it("niet_bewerkbaar -> 422 met de boodschap uit writeback.ts", async () => {
    mockWerkBij.mockResolvedValue({ soort: "niet_bewerkbaar", boodschap: "Geen trainerboard-item." });
    const response = await roep({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Geen trainerboard-item.");
  });

  it("resultaat -> 200 met de volledige TrainingWriteBackResultaat-body", async () => {
    const resultaat = {
      kolomResultaten: [{ record: "centraal" as const, veld: "status" as const, status: "geschreven" as const, boodschap: "ok" }],
      algeheleStatus: "volledig_geslaagd" as const,
      opnieuwProberen: { trainerboard: false, centraal: false },
    };
    mockWerkBij.mockResolvedValue({ soort: "resultaat", resultaat });
    const response = await roep({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(resultaat);
  });

  it("een onverwachte fout in werkTrainingBij levert 500 op, geen ongefilterde foutdetails", async () => {
    mockWerkBij.mockRejectedValue(new Error("netwerkfout"));
    const response = await roep({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(response.status).toBe(500);
  });
});

describe("PATCH /api/trainers/trainingen/[id] — rate limiting", () => {
  it("429 na te veel aanvragen van dezelfde trainer binnen het venster", async () => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(9001), cookieAanwezig: true });
    mockWerkBij.mockResolvedValue({ soort: "niet_gevonden" });

    let laatsteStatus = 200;
    for (let i = 0; i < 25; i++) {
      laatsteStatus = (await roep({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } })).status;
    }
    expect(laatsteStatus).toBe(429);
  });
});
