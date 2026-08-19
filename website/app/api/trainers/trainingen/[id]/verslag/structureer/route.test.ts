import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { structureerVerslag } from "@/lib/trainers/verslag";
import type { AuthTrainer } from "@/lib/trainers/auth";

// Traineromgeving V1, Ronde 3 (2026-08-24) — dekt de HTTP-laag van
// POST .../verslag/structureer. structureerVerslag zelf (AI-aanroep/
// ONVERTROUWD-opbouw/persistentie) is al gedekt in lib/trainers/
// verslag.test.ts — deze route-tests bewaken uitsluitend sessieverificatie,
// validatie, rate limiting, uitkomst-vertaling, en met name dat een
// AI-mislukking NOOIT de ruwe providerfoutmelding (uitkomst.boodschap) naar
// de client lekt (opdrachtseis, zelfde eis als app/api/trainers/vraag/route.ts).
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/verslag", () => ({ structureerVerslag: vi.fn() }));

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockStructureer = vi.mocked(structureerVerslag);

function maakTrainer(id: number): AuthTrainer {
  return { id, name: "Wessel", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
}

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers/trainingen/700/verslag/structureer", {
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
  mockStructureer.mockReset();
});

describe("POST .../verslag/structureer — sessie", () => {
  it("weigert zonder geldige trainersessie met 401, roept structureerVerslag nooit aan", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await roep({ trainerInvoer: "Notities" });
    expect(response.status).toBe(401);
    expect(mockStructureer).not.toHaveBeenCalled();
  });
});

describe("POST .../verslag/structureer — validatie", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(101), cookieAanwezig: true });
  });

  it("400 bij ontbrekende trainerInvoer", async () => {
    expect((await roep({})).status).toBe(400);
  });

  it("400 bij een lege/whitespace-only trainerInvoer", async () => {
    expect((await roep({ trainerInvoer: "   " })).status).toBe(400);
  });

  it("geeft trainerInvoer exact door aan structureerVerslag", async () => {
    mockStructureer.mockResolvedValue({ soort: "voorstel", verslag: { id: 1 } as never, structuur: {} as never, voorstelTekst: "x" });
    await roep({ trainerInvoer: "Vandaag rekenen gedaan" }, "700");
    expect(mockStructureer).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 101 }), "700", "Vandaag rekenen gedaan");
  });
});

describe("POST .../verslag/structureer — uitkomst-vertaling", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(102), cookieAanwezig: true });
  });

  it("niet_gevonden -> 404", async () => {
    mockStructureer.mockResolvedValue({ soort: "niet_gevonden" });
    expect((await roep({ trainerInvoer: "x" })).status).toBe(404);
  });

  it("niet_bewerkbaar -> 422 met de boodschap", async () => {
    mockStructureer.mockResolvedValue({ soort: "niet_bewerkbaar", boodschap: "Al bevestigd." });
    const response = await roep({ trainerInvoer: "x" });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Al bevestigd.");
  });

  it("mislukt (AI-fout) -> 502 met een GENERIEKE boodschap, nooit de ruwe providerfout", async () => {
    mockStructureer.mockResolvedValue({ soort: "mislukt", boodschap: "AI-structurering mislukt: interne API-sleutel abc123 ongeldig" });
    const response = await roep({ trainerInvoer: "x" });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).not.toContain("abc123");
    expect(body.error).not.toContain("API-sleutel");
  });

  it("voorstel -> 200 met de verslagrij", async () => {
    const verslag = { id: 1, definitieveTekst: "Wat is behandeld:\nRekenen", aiGegenereerd: true };
    mockStructureer.mockResolvedValue({ soort: "voorstel", verslag: verslag as never, structuur: {} as never, voorstelTekst: "Wat is behandeld:\nRekenen" });
    const response = await roep({ trainerInvoer: "x" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verslag });
  });

  it("een onverwachte fout levert 500 op, geen ongefilterde foutdetails", async () => {
    mockStructureer.mockRejectedValue(new Error("netwerkfout met geheime details"));
    const response = await roep({ trainerInvoer: "x" });
    expect(response.status).toBe(500);
    expect((await response.json()).error).not.toContain("geheime details");
  });
});

describe("POST .../verslag/structureer — rate limiting", () => {
  it("429 na te veel aanvragen van dezelfde trainer binnen het venster", async () => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(9002), cookieAanwezig: true });
    mockStructureer.mockResolvedValue({ soort: "niet_gevonden" });

    let laatsteStatus = 200;
    for (let i = 0; i < 25; i++) {
      laatsteStatus = (await roep({ trainerInvoer: "x" })).status;
    }
    expect(laatsteStatus).toBe(429);
  });
});
