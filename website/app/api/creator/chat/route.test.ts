import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { creatorChat } from "@/lib/creator/creator-chat";

// Zelfde patroon als app/api/creator/approve-knowledge-draft/route.test.ts —
// de daadwerkelijke AI-orchestratie is al gedekt in lib/creator/
// creator-chat.test.ts, deze test dekt uitsluitend de route: auth-gate,
// body-validatie, en dat uitgeslotenRefs (fix-ronde bug #3) daadwerkelijk
// doorgegeven wordt aan creatorChat().

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ secret: "test" }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/creator/creator-chat", () => ({ creatorChat: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockChat = vi.mocked(creatorChat);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/creator/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

const GELDIG_BODY = {
  documentTitel: "Doelen plannen",
  documentTekst: "Bestaande tekst.",
  berichten: [{ role: "user", content: "Schrijf een intro." }],
  knowledgeType: "pedagogisch",
};

const RESULTAAT = { assistantMessage: "Klaar.", documentContent: "Nieuwe tekst.", gebruikteKennis: [] };

beforeEach(() => {
  mockVerify.mockReset();
  mockChat.mockReset();
});

describe("POST /api/creator/chat", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403, zonder de AI aan te roepen", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: GELDIG_BODY }));

    expect(response.status).toBe(403);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("weigert een onvolledige body met 400 (geen documentTitel/berichten)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { documentTitel: "X", berichten: [] } }));

    expect(response.status).toBe(400);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("geeft uitgeslotenRefs door aan creatorChat() (bug #3 — verwijderde kennis blijft geweerd)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockChat.mockResolvedValue(RESULTAAT);
    const uitgeslotenRefs = [{ refCollection: "knowledge-sources" as const, refId: 5 }];

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { ...GELDIG_BODY, uitgeslotenRefs } }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(RESULTAAT);
    expect(mockChat).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ uitgeslotenRefs }));
  });

  it("geeft een foutmelding terug als {error: string} wanneer creatorChat() faalt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockChat.mockRejectedValue(new Error("AI-aanroep mislukt."));

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: GELDIG_BODY }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("AI-aanroep mislukt.");
  });
});
