import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { analyseerBoardRelaties } from "@/lib/trainers-diagnose/monday-readonly";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers-diagnose/monday-readonly", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers-diagnose/monday-readonly")>();
  return { ...echt, analyseerBoardRelaties: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockAnalyseer = vi.mocked(analyseerBoardRelaties);

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers-diagnose/monday/relations", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockAnalyseer.mockReset().mockResolvedValue({
    boardId: "999",
    boardName: "Trainer Wessel Kok",
    boardRelationKolommen: [
      {
        id: "rel_master",
        title: "Master ID",
        doelboards: [{ id: "18420120365", name: "1: Scholen (Master Data)" }],
        vermoedelijkBidirectioneel: false,
        afhankelijkeMirrorKolommen: [],
        ruweSettings: '{"boardIds":[18420120365]}',
      },
    ],
    mirrorKolommen: [],
  });
});

describe("POST /api/trainers-diagnose/monday/relations", () => {
  it("weigert een niet-admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 2, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ boardId: "999" }));
    expect(response.status).toBe(403);
    expect(mockAnalyseer).not.toHaveBeenCalled();
  });

  it("weigert een ontbrekend/ongeldig boardId met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    expect((await POST(maakRequest({}))).status).toBe(400);
    expect((await POST(maakRequest({ boardId: "niet-numeriek" }))).status).toBe(400);
  });

  it("geeft de relatieanalyse terug voor een geldig boardId", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ boardId: "999" }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.analyse.boardRelationKolommen[0].doelboards).toEqual([{ id: "18420120365", name: "1: Scholen (Master Data)" }]);
  });

  it("geeft 404 terug voor een onbestaand board", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockAnalyseer.mockResolvedValue(null);
    const response = await POST(maakRequest({ boardId: "999999" }));
    expect(response.status).toBe(404);
  });

  it("geeft 500 terug met een nette foutmelding wanneer Monday een fout gooit", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockAnalyseer.mockRejectedValue(new Error("Monday API-aanroep mislukt (HTTP 500)."));
    const response = await POST(maakRequest({ boardId: "999" }));
    const data = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).toBe("Monday API-aanroep mislukt (HTTP 500).");
  });
});
