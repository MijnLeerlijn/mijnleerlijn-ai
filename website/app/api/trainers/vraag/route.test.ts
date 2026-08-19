import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { stelTrainerVraag } from "@/lib/trainers/trainer-chat";
import type { AuthTrainer } from "@/lib/trainers/auth";

// Traineromgeving V1, Ronde 2 afronding — Trainer-AI (2026-08-19). Zelfde
// mockpatroon als app/api/trainers/trainingen/[id]/route.test.ts: payload/
// payload.config kaal gemockt, de echte auth-/logica-functie los gemockt.
// stelTrainerVraag zelf (routering/contextminimalisatie/audit) is al gedekt
// in lib/trainers/trainer-chat.test.ts — deze route-tests bewaken
// uitsluitend de HTTP-laag: sessieverificatie, validatie, rate limiting, en
// de vertaling van TrainerVraagUitkomst naar de juiste HTTP-status, plus dat
// nooit een raw error.message naar de client lekt.
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/trainer-chat", () => ({ stelTrainerVraag: vi.fn() }));

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockStelVraag = vi.mocked(stelTrainerVraag);

function maakTrainer(id: number): AuthTrainer {
  return { id, name: "Wessel", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
}

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers/vraag", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockStelVraag.mockReset();
});

describe("POST /api/trainers/vraag — sessie", () => {
  it("weigert zonder geldige trainersessie met 401, roept stelTrainerVraag nooit aan", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest({ vraag: "Wat weten we over deze school?", schoolId: "500" }));
    expect(response.status).toBe(401);
    expect(mockStelVraag).not.toHaveBeenCalled();
  });

  it("een admin/users-sessie is geen trainersessie — verifyTrainerSessionCookie wijst 'm af, dus ook 401", async () => {
    // verifyTrainerSessionCookie zelf toetst tegen de trainer-accounts-
    // collectie (JWT-claim) — een geldige users-sessie levert daar altijd
    // trainer: null op. Hier gesimuleerd zoals de echte functie dat al doet.
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: true, reden: "verkeerde-collectie" });
    const response = await POST(maakRequest({ vraag: "Vraag", schoolId: null }));
    expect(response.status).toBe(401);
    expect(mockStelVraag).not.toHaveBeenCalled();
  });
});

describe("POST /api/trainers/vraag — rate limiting", () => {
  it("geeft 429 na het overschrijden van de limiet, per trainer", async () => {
    // Eigen, verder nergens in dit bestand hergebruikte trainer-ID (9001) —
    // de rate limiter is een echte module-level singleton (maakRateLimiter,
    // lib/contact/validate.ts) die NIET tussen tests wordt gereset; zelfde
    // conventie als app/api/trainers/trainingen/[id]/route.test.ts om te
    // voorkomen dat deze test de limiet voor trainer-ID 1 (gebruikt door alle
    // andere tests in dit bestand) blijvend zou laten aantikken.
    mockVerify.mockResolvedValue({ trainer: maakTrainer(9001), cookieAanwezig: true });
    mockStelVraag.mockResolvedValue({ soort: "antwoord", antwoord: "Antwoord", context: "algemeen" });

    let laatsteStatus = 200;
    for (let i = 0; i < 25; i++) {
      const response = await POST(maakRequest({ vraag: "Vraag", schoolId: null }));
      laatsteStatus = response.status;
    }
    expect(laatsteStatus).toBe(429);
  });
});

describe("POST /api/trainers/vraag — validatie", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(1), cookieAanwezig: true });
  });

  it("weigert een lege vraag met 400", async () => {
    const response = await POST(maakRequest({ vraag: "   ", schoolId: null }));
    expect(response.status).toBe(400);
    expect(mockStelVraag).not.toHaveBeenCalled();
  });

  it("weigert een te lange vraag met 400", async () => {
    const response = await POST(maakRequest({ vraag: "a".repeat(501), schoolId: null }));
    expect(response.status).toBe(400);
    expect(mockStelVraag).not.toHaveBeenCalled();
  });

  it("weigert een schoolId dat geen string of null is met 400", async () => {
    const response = await POST(maakRequest({ vraag: "Vraag", schoolId: 12345 }));
    expect(response.status).toBe(400);
    expect(mockStelVraag).not.toHaveBeenCalled();
  });

  it("weigert onparseerbare JSON met 400", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/trainers/vraag", { method: "POST", headers: { Cookie: "payload-token=geldig" }, body: "{niet-geldig-json" })
    );
    expect(response.status).toBe(400);
  });

  it("accepteert een ontbrekend schoolId als 'Alle scholen' (null)", async () => {
    mockStelVraag.mockResolvedValue({ soort: "antwoord", antwoord: "Antwoord", context: "algemeen" });
    const response = await POST(maakRequest({ vraag: "Wat staat er deze week?" }));
    expect(response.status).toBe(200);
    expect(mockStelVraag).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 1 }), "Wat staat er deze week?", null);
  });
});

describe("POST /api/trainers/vraag — uitkomsten", () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ trainer: maakTrainer(1), cookieAanwezig: true });
  });

  it("200 met antwoord + context bij een geslaagde schoolvraag", async () => {
    mockStelVraag.mockResolvedValue({ soort: "antwoord", antwoord: "Vorige keer is X afgesproken.", context: "school" });
    const response = await POST(maakRequest({ vraag: "Wat is er afgesproken?", schoolId: "500" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ antwoord: "Vorige keer is X afgesproken.", context: "school" });
  });

  it("404 (nooit 403) wanneer het school-ID niet bij deze trainer hoort — privacypatroon zoals haalSchoolDetail", async () => {
    mockStelVraag.mockResolvedValue({ soort: "school_niet_gevonden" });
    const response = await POST(maakRequest({ vraag: "Vraag", schoolId: "999-van-andere-trainer" }));
    expect(response.status).toBe(404);
  });

  it("500 met een generieke boodschap wanneer stelTrainerVraag gooit — nooit de ruwe foutmelding naar de client", async () => {
    mockStelVraag.mockRejectedValue(new Error("AI-provider-sleutel ongeldig, geheim-detail-xyz"));
    const response = await POST(maakRequest({ vraag: "Vraag", schoolId: null }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).not.toContain("geheim-detail-xyz");
    expect(body.error).not.toContain("AI-provider-sleutel");
  });
});
