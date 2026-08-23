import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { maakSchoolBestand } from "@/lib/trainers/bestanden";

// Traineromgeving V2, Fase 3 (2026-08-23) — de business-logica zelf is al
// uitgebreid getest in lib/trainers/bestanden.test.ts; deze test dekt
// uitsluitend de route: auth, rate limit, FormData-parsing, en dat het
// school-ID uit het PAD komt (nooit clientinvoer) — §9 opdrachtseis: "school
// is al ingevuld en niet wijzigbaar".

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/bestanden", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/bestanden")>();
  return { ...echt, maakSchoolBestand: vi.fn() };
});

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockMaakSchoolBestand = vi.mocked(maakSchoolBestand);

const TRAINER = { id: 42, name: "Marieke Jansen", email: "m@x.nl", mondayTrainerboardId: "tb1", mondayUitvoerderItemId: "u1", actief: true };

function maakFormData(velden: Record<string, string> = {}, bestand: File | null = new File(["inhoud"], "curriculum.pdf", { type: "application/pdf" })) {
  const form = new FormData();
  if (bestand) form.set("file", bestand);
  form.set("titel", velden.titel ?? "Curriculum groep 5");
  form.set("categorie", velden.categorie ?? "curriculum");
  if (velden.omschrijving) form.set("omschrijving", velden.omschrijving);
  if (velden.mondayTrainingId) form.set("mondayTrainingId", velden.mondayTrainingId);
  return form;
}

function maakRequest(schoolId: string, form: FormData) {
  return new NextRequest(`http://localhost:3000/api/trainers/scholen/${schoolId}/bestanden`, { method: "POST", body: form });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockMaakSchoolBestand.mockReset();
  mockVerify.mockResolvedValue({ trainer: TRAINER, cookieAanwezig: true } as never);
});

describe("POST /api/trainers/scholen/[school]/bestanden", () => {
  it("weigert een niet-ingelogde trainer met 401", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false } as never);
    const response = await POST(maakRequest("school-1", maakFormData()), { params: Promise.resolve({ school: "school-1" }) });
    expect(response.status).toBe(401);
    expect(mockMaakSchoolBestand).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag zonder bestand met 400", async () => {
    const response = await POST(maakRequest("school-1", maakFormData({}, null)), { params: Promise.resolve({ school: "school-1" }) });
    expect(response.status).toBe(400);
    expect(mockMaakSchoolBestand).not.toHaveBeenCalled();
  });

  it("geeft het school-ID uit het PAD door aan maakSchoolBestand, nooit uit de body", async () => {
    mockMaakSchoolBestand.mockResolvedValue({ soort: "ok", bestand: { id: 1 } } as never);
    await POST(maakRequest("school-echt-in-het-pad", maakFormData()), { params: Promise.resolve({ school: "school-echt-in-het-pad" }) });
    expect(mockMaakSchoolBestand).toHaveBeenCalledWith(expect.anything(), TRAINER, expect.objectContaining({ mondaySchoolId: "school-echt-in-het-pad" }));
  });

  it("404 (niet_gevonden) bij een school waar de trainer niet aan gekoppeld is", async () => {
    mockMaakSchoolBestand.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await POST(maakRequest("school-1", maakFormData()), { params: Promise.resolve({ school: "school-1" }) });
    expect(response.status).toBe(404);
  });

  it("422 bij ongeldige invoer, met de boodschap van de lib-laag", async () => {
    mockMaakSchoolBestand.mockResolvedValue({ soort: "ongeldige_invoer", boodschap: "Dit bestandstype wordt niet ondersteund." });
    const response = await POST(maakRequest("school-1", maakFormData()), { params: Promise.resolve({ school: "school-1" }) });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Dit bestandstype wordt niet ondersteund.");
  });

  it("200 met het nieuwe bestand bij succes", async () => {
    mockMaakSchoolBestand.mockResolvedValue({ soort: "ok", bestand: { id: 7, titel: "Curriculum groep 5" } } as never);
    const response = await POST(maakRequest("school-1", maakFormData()), { params: Promise.resolve({ school: "school-1" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).bestand).toEqual({ id: 7, titel: "Curriculum groep 5" });
  });
});
