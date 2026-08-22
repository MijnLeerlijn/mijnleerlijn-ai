import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { maakLogboekItem } from "@/lib/trainers/logboek";
import type { AuthTrainer } from "@/lib/trainers/auth";

// Traineromgeving V2, Fase 1 (2026-08-28) — dekt de HTTP-laag van POST
// /api/trainers/logboek. maakLogboekItem zelf (eigendom/opslaglogica) is al
// gedekt in lib/trainers/logboek.test.ts — deze route-tests bewaken
// uitsluitend sessieverificatie, validatie, rate limiting en
// uitkomst-vertaling, zelfde mockpatroon als de bestaande verslag/concept-
// route-tests.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/logboek", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/logboek")>();
  return { ...echt, maakLogboekItem: vi.fn() };
});

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockMaakLogboekItem = vi.mocked(maakLogboekItem);

function maakTrainer(id: number): AuthTrainer {
  return { id, name: "Wessel", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
}

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers/logboek", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const GELDIGE_BODY = { mondaySchoolId: "500", type: "telefonisch", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Gebeld over de planning." };

beforeEach(() => {
  mockVerify.mockReset();
  mockMaakLogboekItem.mockReset();
});

describe("POST /api/trainers/logboek — sessie", () => {
  it("weigert zonder geldige trainersessie met 401, roept maakLogboekItem nooit aan", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(401);
    expect(mockMaakLogboekItem).not.toHaveBeenCalled();
  });
});

describe("POST /api/trainers/logboek — validatie", () => {
  const TRAINER = maakTrainer(1);
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: TRAINER, cookieAanwezig: true });
  });

  it("ontbrekende mondaySchoolId -> 400", async () => {
    const response = await POST(maakRequest({ ...GELDIGE_BODY, mondaySchoolId: undefined }));
    expect(response.status).toBe(400);
    expect(mockMaakLogboekItem).not.toHaveBeenCalled();
  });

  it("ongeldig type -> 400", async () => {
    const response = await POST(maakRequest({ ...GELDIGE_BODY, type: "onbestaand" }));
    expect(response.status).toBe(400);
    expect(mockMaakLogboekItem).not.toHaveBeenCalled();
  });

  it("ontbrekende occurredAt -> 400", async () => {
    const response = await POST(maakRequest({ ...GELDIGE_BODY, occurredAt: undefined }));
    expect(response.status).toBe(400);
  });

  it("lege tekst -> 400", async () => {
    const response = await POST(maakRequest({ ...GELDIGE_BODY, tekst: "   " }));
    expect(response.status).toBe(400);
    expect(mockMaakLogboekItem).not.toHaveBeenCalled();
  });

  it("ongeldig JSON-lichaam -> 400", async () => {
    const request = new NextRequest("http://localhost:3000/api/trainers/logboek", {
      method: "POST",
      headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
      body: "{niet-geldig-json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("POST /api/trainers/logboek — uitkomst", () => {
  const TRAINER = maakTrainer(1);
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: TRAINER, cookieAanwezig: true });
  });

  it("geldige aanvraag -> maakLogboekItem aangeroepen met de INGELOGDE trainer (nooit clientinvoer), 200 met het item", async () => {
    mockMaakLogboekItem.mockResolvedValue({
      soort: "ok",
      item: { id: 1, mondaySchoolId: "500", schoolNaam: "School A", type: "telefonisch", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Gebeld over de planning.", createdAt: "2026-08-28T10:00:00.000Z" },
    });

    const response = await POST(maakRequest(GELDIGE_BODY));

    expect(mockMaakLogboekItem).toHaveBeenCalledWith(
      expect.anything(),
      TRAINER,
      expect.objectContaining({ mondaySchoolId: "500", type: "telefonisch", tekst: "Gebeld over de planning." })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.item.id).toBe(1);
  });

  it("niet_gevonden (school/training niet van deze trainer) -> 404, nooit 403 (anti-enumeratie)", async () => {
    mockMaakLogboekItem.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(404);
  });

  it("ongeldige_invoer -> 422 met de boodschap", async () => {
    mockMaakLogboekItem.mockResolvedValue({ soort: "ongeldige_invoer", boodschap: "Vul een notitie in." });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toBe("Vul een notitie in.");
  });

  it("een onverwachte fout -> 500, geen ongevangen exception", async () => {
    mockMaakLogboekItem.mockRejectedValue(new Error("db weg"));
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(500);
  });
});
