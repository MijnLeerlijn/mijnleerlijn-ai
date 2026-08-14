import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalUpdatesOpIds } from "@/lib/sales/monday-client";

// Kernvraag van deze tests (opdrachtseis): "updates van school A zijn nooit
// via school B opvraagbaar" + "geen ongeautoriseerde toegang via update-ID" +
// "volledige tekst wordt niet onbedoeld lokaal opgeslagen" (dit endpoint
// roept nergens een create/update aan — alleen find + de live Monday-fetch).
const { mockFind } = vi.hoisted(() => ({ mockFind: vi.fn() }));
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({ find: mockFind }) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/monday-client", () => ({ haalUpdatesOpIds: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockHaalUpdates = vi.mocked(haalUpdatesOpIds);

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/sales/school/10/log-events/full-text", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "payload-token=geldig-editor" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockVerify.mockReset().mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockFind.mockReset();
  mockHaalUpdates.mockReset();
});

describe("POST /api/sales/school/[id]/log-events/full-text", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ logEventIds: [1] }), { params: Promise.resolve({ id: "10" }) });

    expect(response.status).toBe(403);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("geeft 400 voor een ongeldig school-ID", async () => {
    const response = await POST(maakRequest({ logEventIds: [1] }), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(400);
  });

  it("geeft 400 wanneer logEventIds ontbreekt of leeg is", async () => {
    const response = await POST(maakRequest({ logEventIds: [] }), { params: Promise.resolve({ id: "10" }) });
    expect(response.status).toBe(400);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("geeft 400 bij meer dan 50 logEventIds in één aanvraag", async () => {
    const response = await POST(maakRequest({ logEventIds: Array.from({ length: 51 }, (_, i) => i + 1) }), { params: Promise.resolve({ id: "10" }) });
    expect(response.status).toBe(400);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("schoolisolatie: de where-clause scoped ALTIJD op zowel de gevraagde ID's als de school uit de URL", async () => {
    mockFind.mockResolvedValue({ docs: [] });

    await POST(maakRequest({ logEventIds: [1, 2] }), { params: Promise.resolve({ id: "10" }) });

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "sales-log-events", where: { id: { in: [1, 2] }, school: { equals: 10 } } })
    );
  });

  it("een log-event-ID dat bij een ANDERE school hoort levert simpelweg geen resultaat op (where-clause filtert 'm eruit) — geen aparte foutmelding die het bestaan verraadt", async () => {
    // Payload's eigen where-filtering (school: {equals: 10}) sluit een
    // event van school 99 al uit — deze test bevestigt dat de route daar geen
    // aparte foutafhandeling omheen bouwt die het onderscheid zichtbaar maakt.
    mockFind.mockResolvedValue({ docs: [] }); // simuleert: het gevraagde ID hoort niet bij school 10

    const response = await POST(maakRequest({ logEventIds: [999] }), { params: Promise.resolve({ id: "10" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ resultaten: [] });
    expect(mockHaalUpdates).not.toHaveBeenCalled();
  });

  it("negeert logregels die niet van Monday afkomstig zijn (bv. AI-voorstel/actie-logregels — geen sourceExternalId om op te halen)", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 5, source: "sales-ai", sourceExternalId: null }] });

    const response = await POST(maakRequest({ logEventIds: [5] }), { params: Promise.resolve({ id: "10" }) });
    const data = await response.json();

    expect(data).toEqual({ resultaten: [] });
    expect(mockHaalUpdates).not.toHaveBeenCalled();
  });

  it("haalt de volledige tekst + auteur on-demand op voor Monday-logregels en slaat niets lokaal op", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 5, source: "monday", sourceExternalId: "u123" }] });
    mockHaalUpdates.mockResolvedValue([
      { id: "u123", item_id: "1", text_body: "De volledige contacttekst.", created_at: "x", updated_at: "x", creator: { id: "1", name: "Michel" } },
    ]);

    const response = await POST(maakRequest({ logEventIds: [5] }), { params: Promise.resolve({ id: "10" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ resultaten: [{ logEventId: 5, tekst: "De volledige contacttekst.", auteur: "Michel" }] });
    expect(mockHaalUpdates).toHaveBeenCalledWith(["u123"]);
  });

  it("geeft een nette 500 zonder technische details wanneer de Monday-fetch faalt", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 5, source: "monday", sourceExternalId: "u123" }] });
    mockHaalUpdates.mockRejectedValue(new Error("Monday API-aanroep mislukt (HTTP 500)."));

    const response = await POST(maakRequest({ logEventIds: [5] }), { params: Promise.resolve({ id: "10" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Monday API-aanroep mislukt (HTTP 500).");
  });
});
