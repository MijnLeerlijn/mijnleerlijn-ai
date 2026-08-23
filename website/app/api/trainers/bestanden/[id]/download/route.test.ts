import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { genereerTrainerBestandDownloadUrl } from "@/lib/trainers/bestanden";

// Traineromgeving V2, Fase 3 (2026-08-23) — §13: geautoriseerde download,
// "niet_gevonden" en "geen_toegang" geven BEIDE 404 (anti-enumeratie). De
// autorisatielogica zelf is al gedekt in lib/trainers/bestanden.test.ts.

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/bestanden", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/bestanden")>();
  return { ...echt, genereerTrainerBestandDownloadUrl: vi.fn() };
});

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockGenereerUrl = vi.mocked(genereerTrainerBestandDownloadUrl);

const TRAINER = { id: 42, name: "Marieke Jansen", email: "m@x.nl", mondayTrainerboardId: "tb1", mondayUitvoerderItemId: "u1", actief: true };

function maakRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/trainers/bestanden/${id}/download`);
}

beforeEach(() => {
  mockVerify.mockReset();
  mockGenereerUrl.mockReset();
  mockVerify.mockResolvedValue({ trainer: TRAINER, cookieAanwezig: true } as never);
});

describe("GET /api/trainers/bestanden/[id]/download", () => {
  it("weigert een niet-ingelogde trainer met 401", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false } as never);
    const response = await GET(maakRequest("1"), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(401);
  });

  it("400 bij een niet-numeriek ID", async () => {
    const response = await GET(maakRequest("abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(400);
  });

  it("404 als het bestand niet bestaat", async () => {
    mockGenereerUrl.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await GET(maakRequest("999"), { params: Promise.resolve({ id: "999" }) });
    expect(response.status).toBe(404);
  });

  it("404 (niet 403) bij geen toegang — anti-enumeratie", async () => {
    mockGenereerUrl.mockResolvedValue({ soort: "geen_toegang" });
    const response = await GET(maakRequest("1"), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(404);
  });

  it("redirect (302) naar de signed URL bij geautoriseerde toegang, nooit gecachet", async () => {
    mockGenereerUrl.mockResolvedValue({ soort: "ok", url: "https://signed.example/x", bestand: {} as never });
    const response = await GET(maakRequest("1"), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed.example/x");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
