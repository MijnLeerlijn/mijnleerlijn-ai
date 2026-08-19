import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { bevestigVerslag } from "@/lib/trainers/verslag";
import type { AuthTrainer } from "@/lib/trainers/auth";

// Traineromgeving V1, Ronde 3 (2026-08-24) — dekt de HTTP-laag van
// POST .../verslag/bevestig. bevestigVerslag zelf (idempotente dubbele
// Monday-write/afronding) is al gedekt in lib/trainers/verslag.test.ts —
// deze route-tests bewaken uitsluitend sessieverificatie, validatie, rate
// limiting en uitkomst-vertaling. Bedient zowel de allereerste bevestiging
// als een latere retry via hetzelfde endpoint (zie route.ts se toelichting).
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/verslag", () => ({ bevestigVerslag: vi.fn() }));

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockBevestig = vi.mocked(bevestigVerslag);

function maakTrainer(id: number): AuthTrainer {
  return { id, name: "Wessel", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
}

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers/trainingen/700/verslag/bevestig", {
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
  mockBevestig.mockReset();
});

describe("POST .../verslag/bevestig — sessie", () => {
  it("weigert zonder geldige trainersessie met 401, roept bevestigVerslag nooit aan", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await roep({ definitieveTekst: "Tekst" });
    expect(response.status).toBe(401);
    expect(mockBevestig).not.toHaveBeenCalled();
  });
});

describe("POST .../verslag/bevestig — validatie", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(101), cookieAanwezig: true });
  });

  it("400 bij een niet-string definitieveTekst", async () => {
    expect((await roep({ definitieveTekst: 123 })).status).toBe(400);
  });

  it("staat een leeg body toe (retry-aanroep zonder tekst) — validatie zelf is geen 400", async () => {
    mockBevestig.mockResolvedValue({ soort: "resultaat", verslag: { id: 1 } as never });
    expect((await roep({})).status).toBe(200);
    expect(mockBevestig).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 101 }), "700", undefined);
  });

  it("geeft definitieveTekst exact door aan bevestigVerslag", async () => {
    mockBevestig.mockResolvedValue({ soort: "resultaat", verslag: { id: 1 } as never });
    await roep({ definitieveTekst: "Wat is behandeld:\nRekenen" }, "700");
    expect(mockBevestig).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 101 }), "700", "Wat is behandeld:\nRekenen");
  });
});

describe("POST .../verslag/bevestig — uitkomst-vertaling", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(102), cookieAanwezig: true });
  });

  it("niet_gevonden -> 404", async () => {
    mockBevestig.mockResolvedValue({ soort: "niet_gevonden" });
    expect((await roep({ definitieveTekst: "x" })).status).toBe(404);
  });

  it("niet_bewerkbaar -> 422 met de boodschap", async () => {
    mockBevestig.mockResolvedValue({ soort: "niet_bewerkbaar", boodschap: "Geen tekst opgegeven om te bevestigen." });
    const response = await roep({});
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Geen tekst opgegeven om te bevestigen.");
  });

  it("geannuleerd -> 409 (conflict met de actuele trainingstatus, geen ongeldige aanvraag)", async () => {
    mockBevestig.mockResolvedValue({ soort: "geannuleerd", boodschap: "Deze training is inmiddels geannuleerd — er wordt geen verslag geschreven." });
    const response = await roep({ definitieveTekst: "x" });
    expect(response.status).toBe(409);
  });

  it("resultaat -> 200 met de verslagrij en eventuele boodschap (bv. 'gedeeltelijk opgeslagen')", async () => {
    const verslag = { id: 1, status: "gedeeltelijk" };
    mockBevestig.mockResolvedValue({ soort: "resultaat", verslag: verslag as never, boodschap: "Verslag gedeeltelijk opgeslagen." });
    const response = await roep({ definitieveTekst: "x" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verslag, boodschap: "Verslag gedeeltelijk opgeslagen.", afronding: undefined });
  });

  it("een onverwachte fout levert 500 op", async () => {
    mockBevestig.mockRejectedValue(new Error("netwerkfout"));
    expect((await roep({ definitieveTekst: "x" })).status).toBe(500);
  });
});

describe("POST .../verslag/bevestig — rate limiting", () => {
  it("429 na te veel aanvragen van dezelfde trainer binnen het venster", async () => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(9003), cookieAanwezig: true });
    mockBevestig.mockResolvedValue({ soort: "niet_gevonden" });

    let laatsteStatus = 200;
    for (let i = 0; i < 25; i++) {
      laatsteStatus = (await roep({ definitieveTekst: "x" })).status;
    }
    expect(laatsteStatus).toBe(429);
  });
});
