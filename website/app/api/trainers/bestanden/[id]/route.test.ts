import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { verwijderTrainerBestand } from "@/lib/trainers/bestanden";

// Traineromgeving V2, Fase 3 (2026-08-23) — §7: eigen bestand verwijderen.
// De eigendomscontrole zelf (wie mag wat verwijderen) is al gedekt in
// lib/trainers/bestanden.test.ts — hier uitsluitend routegedrag.

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/bestanden", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/bestanden")>();
  return { ...echt, verwijderTrainerBestand: vi.fn() };
});

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockVerwijder = vi.mocked(verwijderTrainerBestand);

const TRAINER = { id: 42, name: "Marieke Jansen", email: "m@x.nl", mondayTrainerboardId: "tb1", mondayUitvoerderItemId: "u1", actief: true };

function maakRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/trainers/bestanden/${id}`, { method: "DELETE" });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockVerwijder.mockReset();
  mockVerify.mockResolvedValue({ trainer: TRAINER, cookieAanwezig: true } as never);
});

describe("DELETE /api/trainers/bestanden/[id]", () => {
  it("weigert een niet-ingelogde trainer met 401", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false } as never);
    const response = await DELETE(maakRequest("1"), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(401);
    expect(mockVerwijder).not.toHaveBeenCalled();
  });

  it("404 als het bestand niet bestaat", async () => {
    mockVerwijder.mockResolvedValue("niet_gevonden");
    const response = await DELETE(maakRequest("999"), { params: Promise.resolve({ id: "999" }) });
    expect(response.status).toBe(404);
  });

  it("404 (niet 403) als de trainer geen eigenaar is — verwijderen van andermans bestand geweigerd, anti-enumeratie", async () => {
    mockVerwijder.mockResolvedValue("geen_toegang");
    const response = await DELETE(maakRequest("1"), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(404);
  });

  it("200 bij succesvol verwijderen van het eigen bestand", async () => {
    mockVerwijder.mockResolvedValue("ok");
    const response = await DELETE(maakRequest("1"), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
