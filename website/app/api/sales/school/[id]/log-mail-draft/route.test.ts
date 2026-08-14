import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Sales UX V2 (2026-08-14) — minimale Mail↔School-koppeling. Belangrijkste
// eis om te bewaken: GEEN volledige mailtekst in sales-log-events, alleen
// een korte, statische samenvatting + een relatie naar het bestaande
// mail-drafts-record. Zelfde mocking-patroon als het bestaande
// chat/route.test.ts.
const mockFindByID = vi.fn();
const mockCreate = vi.fn();
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({ findByID: mockFindByID, create: mockCreate }) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/payload/access/roles", () => ({ isEditor: () => true }));
vi.mock("@/lib/auth/verify-session", () => ({
  verifyAdminSessionCookie: vi.fn().mockResolvedValue({ user: { id: 7, role: "editor" } }),
  PAYLOAD_SESSION_COOKIE_NAME: "payload-token",
}));

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/sales/school/42/log-mail-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sales/school/[id]/log-mail-draft", () => {
  beforeEach(() => {
    mockFindByID.mockReset();
    mockCreate.mockReset().mockResolvedValue({ id: 999 });
  });

  it("legt uitsluitend een korte samenvatting + relatie vast — NOOIT de volledige mailtekst", async () => {
    mockFindByID.mockImplementation(({ collection }: { collection: string }) =>
      collection === "sales-schools" ? Promise.resolve({ id: 42 }) : Promise.resolve({ id: 100, subject: "Demo?", draftReply: "Beste Bianca, hierbij een lang, volledig mailantwoord met alle details..." })
    );
    const { POST } = await import("./route");

    const response = await POST(maakRequest({ mailDraftId: 100, onderwerp: "Demo?" }), { params: Promise.resolve({ id: "42" }) });

    expect(response.status).toBe(200);
    const call = mockCreate.mock.calls[0]![0];
    expect(call.collection).toBe("sales-log-events");
    expect(call.data.school).toBe(42);
    expect(call.data.relatedMailDraft).toBe(100);
    expect(call.data.summary).toBe("Mailconcept gemaakt · Demo?");
    expect(call.data.summary).not.toContain("volledig mailantwoord");
    expect(JSON.stringify(call.data)).not.toContain("Beste Bianca");
  });

  it("geeft 404 wanneer de school niet bestaat", async () => {
    mockFindByID.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(maakRequest({ mailDraftId: 100 }), { params: Promise.resolve({ id: "42" }) });

    expect(response.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer het mailconcept niet bestaat", async () => {
    mockFindByID.mockImplementation(({ collection }: { collection: string }) => (collection === "sales-schools" ? Promise.resolve({ id: 42 }) : Promise.resolve(null)));
    const { POST } = await import("./route");

    const response = await POST(maakRequest({ mailDraftId: 999999 }), { params: Promise.resolve({ id: "42" }) });

    expect(response.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("geeft 400 zonder geldig mailDraftId", async () => {
    const { POST } = await import("./route");

    const response = await POST(maakRequest({}), { params: Promise.resolve({ id: "42" }) });

    expect(response.status).toBe(400);
    expect(mockFindByID).not.toHaveBeenCalled();
  });

  it("valt terug op '(zonder onderwerp)' als er geen onderwerp is meegegeven", async () => {
    mockFindByID.mockResolvedValue({ id: 42 });
    const { POST } = await import("./route");

    await POST(maakRequest({ mailDraftId: 100 }), { params: Promise.resolve({ id: "42" }) });

    expect(mockCreate.mock.calls[0]![0].data.summary).toBe("Mailconcept gemaakt · (zonder onderwerp)");
  });
});
