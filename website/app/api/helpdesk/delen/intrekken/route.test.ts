import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { trekDeelLinkIn } from "@/lib/helpdesk/delen";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/helpdesk/delen", () => ({ trekDeelLinkIn: vi.fn() }));

const mockTrekDeelLinkIn = vi.mocked(trekDeelLinkIn);

function maakRequest(opties: { body?: unknown; ip?: string } = {}) {
  return new NextRequest("http://localhost:3000/api/helpdesk/delen/intrekken", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opties.ip ? { "x-real-ip": opties.ip } : {}) },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockTrekDeelLinkIn.mockReset();
});

// Idempotent, publiek, geen sessiecontrole — zie de toelichting in
// app/api/helpdesk/delen/intrekken/route.ts. Hier wordt uitsluitend
// routegedrag getest (validatie/statuscodes/rate limiting); de eigenlijke
// intrek-logica zit in lib/helpdesk/delen.test.ts.
describe("POST /api/helpdesk/delen/intrekken", () => {
  it("weigert een aanvraag zonder token met 400", async () => {
    const response = await POST(maakRequest({ body: {} }));
    expect(response.status).toBe(400);
    expect(mockTrekDeelLinkIn).not.toHaveBeenCalled();
  });

  it("weigert een leeg/whitespace token met 400", async () => {
    const response = await POST(maakRequest({ body: { token: "   " } }));
    expect(response.status).toBe(400);
    expect(mockTrekDeelLinkIn).not.toHaveBeenCalled();
  });

  it("geeft ok terug en trekt de link in bij een geldig token", async () => {
    mockTrekDeelLinkIn.mockResolvedValue("ingetrokken");
    const response = await POST(maakRequest({ body: { token: "abc123" } }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(mockTrekDeelLinkIn).toHaveBeenCalledWith(expect.anything(), "abc123");
  });

  it("geeft hetzelfde nette resultaat terug voor een onbekende/al ingetrokken token (idempotent, geen bevestiging van bestaan)", async () => {
    mockTrekDeelLinkIn.mockResolvedValue("niet_gevonden");
    const response = await POST(maakRequest({ body: { token: "bestaat-niet" } }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
  });

  it("blokkeert na te veel pogingen van hetzelfde IP-adres (rate limiting)", async () => {
    mockTrekDeelLinkIn.mockResolvedValue("ingetrokken");
    const ip = "203.0.113.21";
    for (let i = 0; i < 20; i += 1) {
      const ok = await POST(maakRequest({ body: { token: "abc123" }, ip }));
      expect(ok.status).toBe(200);
    }
    const geblokkeerd = await POST(maakRequest({ body: { token: "abc123" }, ip }));
    expect(geblokkeerd.status).toBe(429);
  });
});
