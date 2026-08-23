import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { beantwoordTrainerKennisVraag } from "@/lib/trainers/kennis";
import type { AuthTrainer } from "@/lib/trainers/auth";

// Vervolgronde (2026-08-22) — zelfde mockpatroon als
// app/api/trainers/vraag/route.test.ts: payload/payload.config kaal
// gemockt, de echte retrievalfunctie los gemockt. beantwoordTrainerKennisVraag
// zelf (retrieval/prompt/fallback) is al gedekt in lib/trainers/kennis.test.ts
// en lib/trainers/kennis-antwoord.test.ts — deze route-tests bewaken
// uitsluitend de HTTP-laag: sessieverificatie ("trainerauth/scoping"),
// validatie, rate limiting, en dat nooit een raw foutmelding naar de client
// lekt.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/kennis", () => ({ beantwoordTrainerKennisVraag: vi.fn() }));

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockBeantwoord = vi.mocked(beantwoordTrainerKennisVraag);

function maakTrainer(id: number): AuthTrainer {
  return { id, name: "Wessel", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
}

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers/kennis/vraag", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockBeantwoord.mockReset();
});

describe("POST /api/trainers/kennis/vraag — sessie (trainerauth/scoping)", () => {
  it("weigert zonder geldige trainersessie met 401, roept beantwoordTrainerKennisVraag nooit aan", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest({ vraag: "Hoe begeleid ik een school hierbij?" }));
    expect(response.status).toBe(401);
    expect(mockBeantwoord).not.toHaveBeenCalled();
  });

  it("een admin/users-sessie is geen trainersessie — ook 401", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: true, reden: "verkeerde-collectie" });
    const response = await POST(maakRequest({ vraag: "Vraag" }));
    expect(response.status).toBe(401);
    expect(mockBeantwoord).not.toHaveBeenCalled();
  });
});

describe("POST /api/trainers/kennis/vraag — rate limiting", () => {
  it("geeft 429 na het overschrijden van de limiet, per trainer", async () => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(9001), cookieAanwezig: true });
    mockBeantwoord.mockResolvedValue({ type: "answered", answer: "Antwoord", reasoning: "Reden", confidence: 80, model: "gpt-4o", bronnen: [] });

    let laatsteStatus = 200;
    for (let i = 0; i < 25; i++) {
      const response = await POST(maakRequest({ vraag: "Vraag" }));
      laatsteStatus = response.status;
    }
    expect(laatsteStatus).toBe(429);
  });
});

describe("POST /api/trainers/kennis/vraag — validatie", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(1), cookieAanwezig: true });
  });

  it("weigert een lege vraag met 400", async () => {
    const response = await POST(maakRequest({ vraag: "   " }));
    expect(response.status).toBe(400);
    expect(mockBeantwoord).not.toHaveBeenCalled();
  });

  it("weigert een te lange vraag met 400", async () => {
    const response = await POST(maakRequest({ vraag: "a".repeat(501) }));
    expect(response.status).toBe(400);
    expect(mockBeantwoord).not.toHaveBeenCalled();
  });

  it("weigert onparseerbare JSON met 400", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/trainers/kennis/vraag", { method: "POST", headers: { Cookie: "payload-token=geldig" }, body: "{niet-geldig-json" })
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/trainers/kennis/vraag — uitkomsten", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(1), cookieAanwezig: true });
  });

  // Productiecontrole (2026-08-23) — beantwoordTrainerKennisVraag logt sinds
  // deze ronde ook een vraaglog per trainer (opdrachtseis §3); de route moet
  // daarvoor de ECHTE, server-geverifieerde trainer.id doorgeven, nooit een
  // client-aangeleverde waarde.
  it("geeft de sessie-trainer.id door aan beantwoordTrainerKennisVraag", async () => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(777), cookieAanwezig: true });
    mockBeantwoord.mockResolvedValue({ type: "no-answer", answer: "X", reasoning: "R", confidence: 0, model: "test", bronnen: [] });
    await POST(maakRequest({ vraag: "Een vraag" }));
    expect(mockBeantwoord).toHaveBeenCalledWith(expect.anything(), 777, "Een vraag");
  });

  it("200 met antwoord + bronnen (id/titel) bij een geslaagd antwoord", async () => {
    mockBeantwoord.mockResolvedValue({
      type: "answered",
      answer: "Zo begeleid je een school hierbij.",
      reasoning: "Gebaseerd op artikel X.",
      confidence: 82,
      model: "gpt-4o",
      bronnen: [{ id: 5, titel: "Periodevoorbereiding", tekst: "volledige tekst", similarity: 0.82 }],
    });
    const response = await POST(maakRequest({ vraag: "Hoe begeleid ik een periodevoorbereiding?" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ antwoord: "Zo begeleid je een school hierbij.", bronnen: [{ id: 5, titel: "Periodevoorbereiding" }] });
  });

  it("200 met de eerlijke fallback-tekst en lege bronnenlijst wanneer er geen betrouwbaar antwoord is", async () => {
    mockBeantwoord.mockResolvedValue({
      type: "no-answer",
      answer: "Daarover heb ik in de beschikbare trainerkennis nog onvoldoende informatie.",
      reasoning: "Geen bron gevonden.",
      confidence: 0,
      model: "gpt-4o",
      bronnen: [],
    });
    const response = await POST(maakRequest({ vraag: "Een vraag zonder dekking" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ antwoord: "Daarover heb ik in de beschikbare trainerkennis nog onvoldoende informatie.", bronnen: [] });
  });

  it("500 met een generieke boodschap wanneer de retrieval/AI-laag 'failed' teruggeeft — nooit de ruwe foutmelding naar de client", async () => {
    mockBeantwoord.mockResolvedValue({ type: "failed", foutmelding: "AI-provider-sleutel ongeldig, geheim-detail-xyz" });
    const response = await POST(maakRequest({ vraag: "Vraag" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).not.toContain("geheim-detail-xyz");
  });

  it("500 met een generieke boodschap wanneer beantwoordTrainerKennisVraag gooit", async () => {
    mockBeantwoord.mockRejectedValue(new Error("interne-databasefout-xyz"));
    const response = await POST(maakRequest({ vraag: "Vraag" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).not.toContain("interne-databasefout-xyz");
  });
});
