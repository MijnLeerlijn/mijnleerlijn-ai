import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { genereerTrainerversie, genereerTrainerversieVanTekst } from "@/lib/creator/trainer-kennisversie";

// Kennisbasis-basiskennis (2026-08-23) — dekt de generalisatie van deze
// route (was alleen articleId, nu ook knowledgeSourceId voor de "Maak
// trainerversie"-knop op /admin/kennisbasis, KennisbasisView.tsx). De
// AI-herschrijffunctie zelf is al los getest in
// lib/creator/trainer-kennisversie.test.ts — deze test dekt uitsluitend de
// route: auth, validatie, bronopzoeking, en de nieuwe
// isAchtergrondDocument-bewaking (nooit een willekeurige andere
// knowledge-source hierlangs laten herschrijven).

// mockFindByID is bewust een kale, ongetypeerde vi.fn() (via vi.hoisted, i.p.v.
// achteraf vi.mocked(payload.findByID) op de echte, strikt-getypeerde
// Payload-local-API aanroepen) — anders dwingt Payload's eigen overloaded
// findByID-signatuur elke testfixture hieronder tot een volledig, correct
// KnowledgeSource/Article-object. Zelfde precedent als
// app/api/werk/voorbereiding/ai-voorstel/route.test.ts.
const mockFindByID = vi.hoisted(() => vi.fn());

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({ findByID: mockFindByID }) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/creator/trainer-kennisversie", () => ({
  genereerTrainerversie: vi.fn(),
  genereerTrainerversieVanTekst: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockGenereerArtikel = vi.mocked(genereerTrainerversie);
const mockGenereerVanTekst = vi.mocked(genereerTrainerversieVanTekst);

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/creator/trainer-kennisversie", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "payload-token=geldig" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockGenereerArtikel.mockReset();
  mockGenereerVanTekst.mockReset();
  mockFindByID.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("POST /api/creator/trainer-kennisversie", () => {
  it("weigert een niet-editor met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ articleId: 1 }));

    expect(response.status).toBe(403);
    expect(mockGenereerArtikel).not.toHaveBeenCalled();
  });

  it("weigert een body zonder articleId én zonder knowledgeSourceId met 400", async () => {
    const response = await POST(maakRequest({}));
    expect(response.status).toBe(400);
  });

  describe("articleId-pad (bestaand gedrag, ongewijzigd)", () => {
    it("404 als het artikel niet bestaat", async () => {
      mockFindByID.mockRejectedValueOnce(new Error("niet gevonden"));

      const response = await POST(maakRequest({ articleId: 999 }));

      expect(response.status).toBe(404);
      expect(mockGenereerArtikel).not.toHaveBeenCalled();
    });

    it("200 en roept genereerTrainerversie aan met de artikelvelden", async () => {
      mockFindByID.mockResolvedValueOnce({
        id: 5,
        title: "Titel",
        summary: "S",
        tags: [],
        category: null,
        sections: [],
      });
      mockGenereerArtikel.mockResolvedValue({ titel: "Trainertitel", tekst: "Trainertekst" });

      const response = await POST(maakRequest({ articleId: 5 }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ titel: "Trainertitel", tekst: "Trainertekst", sourceArticleId: 5 });
      expect(mockGenereerVanTekst).not.toHaveBeenCalled();
    });
  });

  describe("knowledgeSourceId-pad (nieuw — Kennisbasis)", () => {
    it("404 als het knowledge-source-document niet bestaat", async () => {
      mockFindByID.mockRejectedValueOnce(new Error("niet gevonden"));

      const response = await POST(maakRequest({ knowledgeSourceId: 999 }));

      expect(response.status).toBe(404);
      expect(mockGenereerVanTekst).not.toHaveBeenCalled();
    });

    it("400 als het document geen achtergronddocument is (nooit een willekeurige andere bron herschrijven)", async () => {
      mockFindByID.mockResolvedValueOnce({
        id: 3,
        title: "Losse PDF",
        type: "pdf",
        purpose: null,
        content: "tekst",
      });

      const response = await POST(maakRequest({ knowledgeSourceId: 3 }));

      expect(response.status).toBe(400);
      expect(mockGenereerVanTekst).not.toHaveBeenCalled();
    });

    it("400 als de Kennisbasis nog geen tekst heeft", async () => {
      mockFindByID.mockResolvedValueOnce({
        id: 3,
        title: "Kennisbasis MijnLeerlijn",
        type: "intern_document",
        purpose: null,
        content: "   ",
      });

      const response = await POST(maakRequest({ knowledgeSourceId: 3 }));

      expect(response.status).toBe(400);
      expect(mockGenereerVanTekst).not.toHaveBeenCalled();
    });

    it("200 en roept genereerTrainerversieVanTekst aan met titel/content van de Kennisbasis", async () => {
      mockFindByID.mockResolvedValueOnce({
        id: 3,
        title: "Kennisbasis MijnLeerlijn",
        type: "intern_document",
        purpose: null,
        content: "De achtergrondtekst.",
      });
      mockGenereerVanTekst.mockResolvedValue({ titel: "Trainertitel", tekst: "Trainertekst" });

      const response = await POST(maakRequest({ knowledgeSourceId: 3 }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ titel: "Trainertitel", tekst: "Trainertekst", knowledgeSourceId: 3 });
      expect(mockGenereerVanTekst).toHaveBeenCalledWith(
        "Kennisbasis MijnLeerlijn",
        "De achtergrondtekst.",
        "Kennisbasis-document"
      );
      expect(mockGenereerArtikel).not.toHaveBeenCalled();
    });

    it("herkent purpose:'background-model' op een niet-intern_document-type ook als achtergronddocument", async () => {
      mockFindByID.mockResolvedValueOnce({
        id: 4,
        title: "Kennisbasis MijnMonti",
        type: "website",
        purpose: "background-model",
        content: "Tekst.",
      });
      mockGenereerVanTekst.mockResolvedValue({ titel: "T", tekst: "X" });

      const response = await POST(maakRequest({ knowledgeSourceId: 4 }));

      expect(response.status).toBe(200);
    });
  });

  it("500 met de foutmelding als de generatie zelf mislukt, zonder de body opnieuw te lezen", async () => {
    mockFindByID.mockResolvedValueOnce({ id: 5, title: "T", sections: [] });
    mockGenereerArtikel.mockRejectedValue(new Error("AI-aanroep mislukt"));

    const response = await POST(maakRequest({ articleId: 5 }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("AI-aanroep mislukt");
  });
});
