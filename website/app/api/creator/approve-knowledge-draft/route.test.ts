import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { keurMailKennisstukGoed } from "@/lib/creator/approve-mail-knowledge";

// De opslaglogica zelf is al gedekt in lib/creator/approve-mail-knowledge.
// test.ts — deze test dekt uitsluitend de route: wordt een niet-beheerder
// (ook een gewone editor — anders dan de overige creator-routes, zie het
// commentaar in route.ts) daadwerkelijk geweigerd vóórdat er iets
// opgeslagen wordt, en wordt de body correct doorgegeven.

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ secret: "test" }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/creator/approve-mail-knowledge", () => ({ keurMailKennisstukGoed: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockKeur = vi.mocked(keurMailKennisstukGoed);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/creator/approve-knowledge-draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

const GELDIG_BODY = {
  mailDraftId: 7,
  title: "T",
  question: "Q",
  shortAnswer: "S",
  fullAnswer: "F",
  customerSpecificInformationFound: false,
};

beforeEach(() => {
  mockVerify.mockReset();
  mockKeur.mockReset();
});

describe("POST /api/creator/approve-knowledge-draft", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403, zonder iets op te slaan", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: GELDIG_BODY }));

    expect(response.status).toBe(403);
    expect(mockKeur).not.toHaveBeenCalled();
  });

  it("weigert een ingelogde editor (niet-admin) met 403 — KnowledgeDrafts is admin-only, anders dan de overige creator-routes", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-maar-editor", body: GELDIG_BODY }));

    expect(response.status).toBe(403);
    expect(mockKeur).not.toHaveBeenCalled();
  });

  it("weigert een onvolledige body met 400, ook als de gebruiker admin is", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { mailDraftId: 7 } }));

    expect(response.status).toBe(400);
    expect(mockKeur).not.toHaveBeenCalled();
  });

  it("slaat het kennisstuk op voor een admin en geeft het nieuwe id terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockKeur.mockResolvedValue({ id: 42 });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: GELDIG_BODY }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ id: 42 });
    expect(mockKeur).toHaveBeenCalledWith(expect.anything(), GELDIG_BODY);
  });
});
