import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { maakAlgemeenBestand } from "@/lib/trainers/bestanden";

// Traineromgeving V2, Fase 3 (2026-08-23) — zelfde opzet als de
// schoolbestanden-routetest: business-logica al gedekt in
// lib/trainers/bestanden.test.ts, hier uitsluitend routegedrag (auth,
// FormData-parsing, doorgeven van meerdere "deelgroepen"-waarden).

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/bestanden", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/bestanden")>();
  return { ...echt, maakAlgemeenBestand: vi.fn() };
});

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockMaakAlgemeenBestand = vi.mocked(maakAlgemeenBestand);

const TRAINER = { id: 42, name: "Marieke Jansen", email: "m@x.nl", mondayTrainerboardId: "tb1", mondayUitvoerderItemId: "u1", actief: true };

function maakRequest(velden: { titel?: string; categorie?: string; zichtbaarheid?: string; deelgroepen?: number[] } = {}) {
  const form = new FormData();
  form.set("file", new File(["inhoud"], "presentatie.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
  form.set("titel", velden.titel ?? "Presentatie kick-off");
  form.set("categorie", velden.categorie ?? "presentatie");
  form.set("zichtbaarheid", velden.zichtbaarheid ?? "prive");
  for (const id of velden.deelgroepen ?? []) form.append("deelgroepen", String(id));
  return new NextRequest("http://localhost:3000/api/trainers/bestanden", { method: "POST", body: form });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockMaakAlgemeenBestand.mockReset();
  mockVerify.mockResolvedValue({ trainer: TRAINER, cookieAanwezig: true } as never);
});

describe("POST /api/trainers/bestanden", () => {
  it("weigert een niet-ingelogde trainer met 401", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false } as never);
    const response = await POST(maakRequest());
    expect(response.status).toBe(401);
    expect(mockMaakAlgemeenBestand).not.toHaveBeenCalled();
  });

  it("geeft alle geselecteerde deelgroep-ID's als getallen door", async () => {
    mockMaakAlgemeenBestand.mockResolvedValue({ soort: "ok", bestand: { id: 1 } } as never);
    await POST(maakRequest({ zichtbaarheid: "gedeeld", deelgroepen: [10, 11] }));
    expect(mockMaakAlgemeenBestand).toHaveBeenCalledWith(expect.anything(), TRAINER, expect.objectContaining({ deelgroepIds: [10, 11] }));
  });

  it("422 als de lib-laag delen met een niet-eigen groep weigert", async () => {
    mockMaakAlgemeenBestand.mockResolvedValue({ soort: "ongeldige_invoer", boodschap: "Je kunt alleen delen met groepen waar je zelf lid van bent." });
    const response = await POST(maakRequest({ zichtbaarheid: "gedeeld", deelgroepen: [999] }));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Je kunt alleen delen met groepen waar je zelf lid van bent.");
  });

  it("200 met het nieuwe bestand bij succes", async () => {
    mockMaakAlgemeenBestand.mockResolvedValue({ soort: "ok", bestand: { id: 9, titel: "Presentatie kick-off" } } as never);
    const response = await POST(maakRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).bestand).toEqual({ id: 9, titel: "Presentatie kick-off" });
  });
});
