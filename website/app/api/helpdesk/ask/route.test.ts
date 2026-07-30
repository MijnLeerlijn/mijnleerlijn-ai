import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Variant } from "@/types/variant";
import { POST } from "./route";
import { processPublicQuestion } from "@/lib/assistant/process-public-question";
import { registreerGesteldeVraag } from "@/lib/helpdesk/registreer-gestelde-vraag";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

vi.mock("payload", () => ({
  getPayload: vi
    .fn()
    .mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/assistant/process-public-question", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/assistant/process-public-question")>();
  return { ...echt, processPublicQuestion: vi.fn() };
});
vi.mock("@/lib/helpdesk/registreer-gestelde-vraag", () => ({ registreerGesteldeVraag: vi.fn() }));
vi.mock("@/lib/variant/get-active-variant", () => ({ getActiveVariant: vi.fn() }));

const mockProcess = vi.mocked(processPublicQuestion);
const mockRegistreer = vi.mocked(registreerGesteldeVraag);
const mockGetActiveVariant = vi.mocked(getActiveVariant);

// Multi-brand variants (2026-07-30): één neutrale mock-variant — deze tests
// testen route-gedrag (validatie/foutafhandeling/rate limiting), niet
// variant-scoping zelf (zie de aparte tests daarvoor elders).
const MOCK_VARIANT: Variant = {
  id: "1",
  slug: "mijnleerlijn",
  name: "MijnLeerlijn",
  status: "actief",
  actief: true,
  domain: { type: "custom_domain", value: "mijnleerlijn.chat", domainStatus: "custom_domain" },
  branding: {
    logoUrl: "/brand/logo-kleur.svg",
    accentColor: "#1588c9",
    productName: "MijnLeerlijn",
    tagline: "Onderwijs vanuit Inzicht",
    isPlaceholder: false,
  },
  educationType: "algemeen",
  terminologyDictionary: [],
  websiteTeksten: {
    welkomsttitel: "Waar kunnen we je mee helpen?",
    welkomsttekst: "Stel je vraag aan de MijnLeerlijn Assistent.",
    zoekveldPlaceholder: "Beschrijf zo duidelijk mogelijk waar je tegenaan loopt…",
    helpdeskIntro: "Hoe duidelijker je vraag, hoe beter het antwoord.",
    contactTekst: "Kom je er niet uit? Vul het formulier in.",
    footerTekst: "© 2026 MijnLeerlijn | Onderdeel van sCoolsuite B.V. | Privacy",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "system",
};

function maakRequest(opties: { body?: unknown; ip?: string } = {}) {
  return new NextRequest("http://localhost:3000/api/helpdesk/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.ip ? { "x-real-ip": opties.ip } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockProcess.mockReset();
  mockRegistreer.mockReset();
  mockRegistreer.mockResolvedValue(undefined);
  mockGetActiveVariant.mockReset();
  mockGetActiveVariant.mockResolvedValue(MOCK_VARIANT);
});

// Geen sessiecontrole te testen (bewust, zie het commentaar in route.ts) —
// dat is precies het punt van deze publieke route. Tests bevestigen daarom
// vooral validatie, foutafhandeling en dat de pijplijn zonder userId werkt.
describe("POST /api/helpdesk/ask", () => {
  it("weigert een aanvraag zonder question met 400, zonder de pijplijn aan te roepen", async () => {
    const response = await POST(maakRequest({ body: {} }));

    expect(response.status).toBe(400);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("weigert een te lange vraag met 400", async () => {
    const response = await POST(maakRequest({ body: { question: "x".repeat(1001) } }));

    expect(response.status).toBe(400);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("beantwoordt een geldige, anonieme vraag zonder enige sessiecontrole", async () => {
    mockProcess.mockResolvedValue({
      type: "answered",
      conversationId: 1,
      hasAnswer: true,
      answer: "Antwoord.",
      manuals: [],
      steps: [],
    });

    const response = await POST(maakRequest({ body: { question: "Hoe maak ik een profiel aan?" } }));

    expect(response.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledWith(expect.anything(), {
      question: "Hoe maak ik een profiel aan?",
      variant: MOCK_VARIANT,
    });
    const data = await response.json();
    expect(data.answer).toBe("Antwoord.");
  });

  it("geeft previousQuestion door aan de pijplijn wanneer meegestuurd (vervolg op een verduidelijkingsvraag)", async () => {
    mockProcess.mockResolvedValue({
      type: "clarification",
      conversationId: 2,
      question: "Wil je doelen aan één leerling koppelen, of een doelenset aan meerdere leerlingen?",
    });

    const response = await POST(
      maakRequest({ body: { question: "en aan meerdere?", previousQuestion: "Hoe koppel ik doelen?" } })
    );

    expect(response.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledWith(expect.anything(), {
      question: "en aan meerdere?",
      previousQuestion: "Hoe koppel ik doelen?",
      variant: MOCK_VARIANT,
    });
    const data = await response.json();
    expect(data.type).toBe("clarification");
  });

  it("weigert een ongeldige previousQuestion met 400", async () => {
    const response = await POST(maakRequest({ body: { question: "vraag", previousQuestion: 123 } }));

    expect(response.status).toBe(400);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("geeft een 502 terug wanneer de RAG-pijplijn mislukt", async () => {
    mockProcess.mockResolvedValue({ type: "failed", foutmelding: "OpenAI: server error" });

    const response = await POST(maakRequest({ body: { question: "vraag" } }));

    expect(response.status).toBe(502);
  });

  it("blokkeert na te veel pogingen van hetzelfde IP-adres (rate limiting)", async () => {
    mockProcess.mockResolvedValue({
      type: "answered",
      conversationId: 1,
      hasAnswer: true,
      answer: "Antwoord.",
      manuals: [],
      steps: [],
    });

    const ip = "203.0.113.10";
    for (let i = 0; i < 20; i += 1) {
      const ok = await POST(maakRequest({ body: { question: `vraag ${i}` }, ip }));
      expect(ok.status).toBe(200);
    }

    const geblokkeerd = await POST(maakRequest({ body: { question: "één te veel" }, ip }));
    expect(geblokkeerd.status).toBe(429);
  });

  // Homepage-herontwerp (2026-07-29): telt "Meest gestelde vragen" — elke
  // aanvraag hier is per definitie een bevestigde "Verstuur"-actie.
  it("telt de gestelde vraag mee via registreerGesteldeVraag", async () => {
    mockProcess.mockResolvedValue({
      type: "answered",
      conversationId: 1,
      hasAnswer: true,
      answer: "Antwoord.",
      manuals: [],
      steps: [],
    });

    await POST(maakRequest({ body: { question: "Hoe maak ik een doelenset aan?" } }));

    expect(mockRegistreer).toHaveBeenCalledWith(expect.anything(), "Hoe maak ik een doelenset aan?", MOCK_VARIANT.id);
  });

  it("blokkeert het antwoord niet als het tellen zelf onverwacht mislukt (registreerGesteldeVraag rejecteert, in de praktijk voorkomen door zijn eigen try/catch)", async () => {
    mockRegistreer.mockRejectedValue(new Error("Tellen mislukt"));
    mockProcess.mockResolvedValue({
      type: "answered",
      conversationId: 1,
      hasAnswer: true,
      answer: "Antwoord.",
      manuals: [],
      steps: [],
    });

    const response = await POST(maakRequest({ body: { question: "vraag" } }));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.answer).toBe("Antwoord.");
  });
});
