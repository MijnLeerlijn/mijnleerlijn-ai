import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockUpdate = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    update: (...args: unknown[]) => mockUpdate(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/knowledge-sources/download-settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockUpdate.mockReset();
});

// Downloadbeheer-fix (2026-07-28): KnowledgeSources.ts staat `update:
// adminOnly` — deze route is de enige, gecontroleerde uitzondering
// (overrideAccess: true) die uitsluitend downloadVisible/downloadCategory
// mag wijzigen, zonder de algemene update-rechten op knowledge-sources te
// verruimen. Zie ook app/api/knowledge-sources/download-settings/route.ts.
describe("POST /api/knowledge-sources/download-settings", () => {
  it("weigert een aanvraag zonder ingelogde admin/editor met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { id: 1, downloadVisible: true } }));

    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("staat een redacteur (niet-admin) toe de downloadzichtbaarheid te wijzigen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockUpdate.mockResolvedValue({});

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5, downloadVisible: true } }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      collection: "knowledge-sources",
      id: 5,
      overrideAccess: true,
      data: { zichtbaar: true },
    });
  });

  it("staat een admin toe de downloadcategorie te wijzigen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockUpdate.mockResolvedValue({});

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5, downloadCategory: 3 } }));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      collection: "knowledge-sources",
      id: 5,
      overrideAccess: true,
      data: { categorie: 3 },
    });
  });

  it("wijzigt beide velden tegelijk als beide zijn meegestuurd", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockUpdate.mockResolvedValue({});

    await POST(
      maakRequest({ cookie: "geldig", body: { id: 5, downloadVisible: false, downloadCategory: null } })
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      collection: "knowledge-sources",
      id: 5,
      overrideAccess: true,
      data: { zichtbaar: false, categorie: null },
    });
  });

  it("weigert een poging om een ander veld via deze route te wijzigen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(
      maakRequest({ cookie: "geldig", body: { id: 5, downloadVisible: true, title: "Andere titel" } })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("title");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag zonder id", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { downloadVisible: true } }));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag zonder downloadVisible en zonder downloadCategory", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5 } }));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert een niet-boolean downloadVisible", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5, downloadVisible: "ja" } }));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert een ongeldige downloadCategory (niet getal, niet null)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5, downloadCategory: "3" } }));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
