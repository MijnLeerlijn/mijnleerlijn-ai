import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { herindexeerTrainerKennisversies, haalKennisRetrievalDiagnose } from "@/lib/trainers/kennis-reindex";

// Productiecontrole (2026-08-23) — dekt uitsluitend routegedrag (auth,
// GET vs. POST); de backfill-/diagnoselogica zelf staat al uitgebreid getest
// in lib/trainers/kennis-reindex.test.ts.

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/kennis-reindex", () => ({
  herindexeerTrainerKennisversies: vi.fn(),
  haalKennisRetrievalDiagnose: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockHerindexeer = vi.mocked(herindexeerTrainerKennisversies);
const mockDiagnose = vi.mocked(haalKennisRetrievalDiagnose);

function maakRequest(method: "GET" | "POST") {
  return new NextRequest("http://localhost:3000/api/admin/trainer-kennis/herindexeer", { method });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockHerindexeer.mockReset();
  mockDiagnose.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("POST /api/admin/trainer-kennis/herindexeer", () => {
  it("weigert een niet-editor met 403, voert geen herindexering uit", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest("POST"));
    expect(response.status).toBe(403);
    expect(mockHerindexeer).not.toHaveBeenCalled();
  });

  it("voert de herindexering uit en geeft de tellingen terug", async () => {
    mockHerindexeer.mockResolvedValue({ totaalGepubliceerd: 5, algGeindexeerd: 3, opnieuwGeindexeerd: 2, mislukt: 0, mislukteDetails: [] });
    const response = await POST(maakRequest("POST"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ totaalGepubliceerd: 5, algGeindexeerd: 3, opnieuwGeindexeerd: 2, mislukt: 0, mislukteDetails: [] });
  });

  // Vervolgronde (2026-08-23) — de kern van deze opdracht: de route moet per
  // mislukking een veilige diagnose teruggeven (categorie/stap/HTTP-status/
  // modelnaam), zodat een volgende mislukking niet meer "1 mislukt" zonder
  // detail oplevert.
  it("geeft mislukteDetails (categorie/stap/HTTP-status/model) door in de response", async () => {
    mockHerindexeer.mockResolvedValue({
      totaalGepubliceerd: 1,
      algGeindexeerd: 0,
      opnieuwGeindexeerd: 0,
      mislukt: 1,
      mislukteDetails: [
        {
          id: 42,
          categorie: "openai_verzoek_ongeldig",
          stap: "aanroep",
          httpStatus: 400,
          model: "text-embedding-3-small",
          inputTekens: 5800,
          geschatTokens: 1450,
          chunkIndex: 2,
          totaalChunks: 5,
        },
      ],
    });
    const response = await POST(maakRequest("POST"));
    const body = await response.json();
    expect(body.mislukteDetails).toEqual([
      {
        id: 42,
        categorie: "openai_verzoek_ongeldig",
        stap: "aanroep",
        httpStatus: 400,
        model: "text-embedding-3-small",
        inputTekens: 5800,
        geschatTokens: 1450,
        chunkIndex: 2,
        totaalChunks: 5,
      },
    ]);
  });
});

describe("GET /api/admin/trainer-kennis/herindexeer", () => {
  it("weigert een niet-editor met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest("GET"));
    expect(response.status).toBe(403);
    expect(mockDiagnose).not.toHaveBeenCalled();
  });

  it("geeft uitsluitend de diagnose-tellingen terug, wijzigt niets", async () => {
    mockDiagnose.mockResolvedValue({ totaalGepubliceerd: 5, geindexeerd: 3, zonderEmbedding: 2 });
    const response = await GET(maakRequest("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ totaalGepubliceerd: 5, geindexeerd: 3, zonderEmbedding: 2 });
    expect(mockHerindexeer).not.toHaveBeenCalled();
  });
});
