import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { maakDeelLink } from "@/lib/helpdesk/delen";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/helpdesk/delen", () => ({ maakDeelLink: vi.fn() }));

const mockMaakDeelLink = vi.mocked(maakDeelLink);

function maakRequest(opties: { body?: unknown; ip?: string } = {}) {
  return new NextRequest("http://localhost:3000/api/helpdesk/delen", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opties.ip ? { "x-real-ip": opties.ip } : {}) },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockMaakDeelLink.mockReset();
});

// Publiek, geen sessiecontrole — zelfde reden als app/api/helpdesk/ask/
// route.ts (de Helpdesk-chat zelf heeft geen login). De eigenlijke
// toegangsgrens ("welk conversationId is deelbaar") zit in maakDeelLink()
// zelf (lib/helpdesk/delen.test.ts), hier wordt uitsluitend routegedrag
// getest: validatie/statuscodes/rate limiting.
describe("POST /api/helpdesk/delen", () => {
  it("weigert een aanvraag zonder conversationIds met 400", async () => {
    const response = await POST(maakRequest({ body: {} }));
    expect(response.status).toBe(400);
    expect(mockMaakDeelLink).not.toHaveBeenCalled();
  });

  it("weigert een conversationIds-array met niet-numerieke waarden", async () => {
    const response = await POST(maakRequest({ body: { conversationIds: [1, "twee"] } }));
    expect(response.status).toBe(400);
    expect(mockMaakDeelLink).not.toHaveBeenCalled();
  });

  it("geeft de token terug bij een geslaagde share", async () => {
    mockMaakDeelLink.mockResolvedValue({ soort: "ok", token: "abc123" });
    const response = await POST(maakRequest({ body: { conversationIds: [1, 2] } }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.token).toBe("abc123");
    expect(mockMaakDeelLink).toHaveBeenCalledWith(expect.anything(), { conversationIds: [1, 2] });
  });

  it("geeft 400 terug wanneer maakDeelLink 'leeg' rapporteert", async () => {
    mockMaakDeelLink.mockResolvedValue({ soort: "leeg" });
    const response = await POST(maakRequest({ body: { conversationIds: [] } }));
    expect(response.status).toBe(400);
  });

  it("geeft 400 terug wanneer maakDeelLink 'geen_geldige_conversaties' rapporteert (bv. een intern gesprek)", async () => {
    mockMaakDeelLink.mockResolvedValue({ soort: "geen_geldige_conversaties" });
    const response = await POST(maakRequest({ body: { conversationIds: [999] } }));
    expect(response.status).toBe(400);
  });

  // Gesprek delen — vervolgen (2026-09-01, spec-eis §6/§7): de client stuurt
  // bij het delen vanuit een al gedeeld/vervolgd gesprek de token van dat
  // ouder-gesprek mee, zodat maakDeelLink() de oorspronkelijke berichten kan
  // laten voorafgaan aan de nieuwe (zie lib/helpdesk/delen.ts).
  it("geeft parentToken door aan maakDeelLink wanneer meegestuurd", async () => {
    mockMaakDeelLink.mockResolvedValue({ soort: "ok", token: "nieuwetoken" });
    const response = await POST(maakRequest({ body: { conversationIds: [2], parentToken: "ouder-token" } }));
    expect(response.status).toBe(200);
    expect(mockMaakDeelLink).toHaveBeenCalledWith(expect.anything(), {
      conversationIds: [2],
      parentToken: "ouder-token",
    });
  });

  it("weigert een parentToken die geen niet-lege string is, met 400", async () => {
    const response = await POST(maakRequest({ body: { conversationIds: [2], parentToken: "" } }));
    expect(response.status).toBe(400);
    expect(mockMaakDeelLink).not.toHaveBeenCalled();
  });

  it("geeft 400 terug wanneer maakDeelLink 'ongeldige_bron' rapporteert (ouder-token niet meer beschikbaar)", async () => {
    mockMaakDeelLink.mockResolvedValue({ soort: "ongeldige_bron" });
    const response = await POST(maakRequest({ body: { conversationIds: [2], parentToken: "verlopen-token" } }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Het oorspronkelijke gedeelde gesprek is niet meer beschikbaar.");
  });

  it("blokkeert na te veel pogingen van hetzelfde IP-adres (rate limiting)", async () => {
    mockMaakDeelLink.mockResolvedValue({ soort: "ok", token: "abc123" });
    const ip = "203.0.113.20";
    for (let i = 0; i < 20; i += 1) {
      const ok = await POST(maakRequest({ body: { conversationIds: [1] }, ip }));
      expect(ok.status).toBe(200);
    }
    const geblokkeerd = await POST(maakRequest({ body: { conversationIds: [1] }, ip }));
    expect(geblokkeerd.status).toBe(429);
  });
});
