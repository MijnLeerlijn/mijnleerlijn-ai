import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createContactSubmission } from "@/services/payload";
import { defaultVariant } from "@/config/variants";

vi.mock("payload", () => ({ getPayload: vi.fn() }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/services/payload", () => ({ createContactSubmission: vi.fn() }));
vi.mock("@/services/storage", () => ({ uploadBijlage: vi.fn() }));
vi.mock("@/services/email", () => ({ verzendEmail: vi.fn() }));

const mockCreateSubmission = vi.mocked(createContactSubmission);

// AI Verbetercentrum (2026-07-27): deze route krijgt hier voor het eerst een
// eigen testbestand — de niet-blokkerende koppeling naar
// assistant-conversations (contactFormSubmitted) is de aanleiding, maar de
// tests dekken ook meteen de bestaande basisvalidatie/honeypot-flow.
function maakFormData(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const velden: Record<string, string> = {
    naam: "Jan Jansen",
    school: "OBS De Regenboog",
    email: "jan@school.nl",
    soortVraag: "Ik snap iets niet",
    onderwerp: "Doelen koppelen",
    uitleg: "Ik snap niet hoe ik doelen koppel.",
    website: "", // honeypot, leeg = mens
    ...overrides,
  };
  for (const [naam, waarde] of Object.entries(velden)) {
    form.set(naam, waarde);
  }
  return form;
}

// Elke test krijgt een uniek IP: de rate limiter (5 pogingen/10 min per IP)
// is module-level state en zou anders tussen tests in hetzelfde bestand
// blijven meetellen — zie ook de "x-real-ip"-aanpak in
// app/api/helpdesk/ask/route.test.ts.
let volgendIp = 1;
function maakRequest(form: FormData, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/contact", {
    method: "POST",
    body: form,
    headers: { "x-real-ip": `203.0.113.${volgendIp++}`, ...extraHeaders },
  });
}

beforeEach(async () => {
  mockCreateSubmission.mockReset();
  mockCreateSubmission.mockResolvedValue({ id: "sub-1" });
  const { getPayload } = await import("payload");
  vi.mocked(getPayload).mockReset();
});

describe("POST /api/contact — basisvalidatie (bestaand gedrag)", () => {
  it("weigert een inzending met ontbrekende verplichte velden", async () => {
    const response = await POST(maakRequest(maakFormData({ email: "" })));

    expect(response.status).toBe(400);
    expect(mockCreateSubmission).not.toHaveBeenCalled();
  });

  it("negeert een honeypot-inzending stil (schijnbaar succes, niets opgeslagen)", async () => {
    const response = await POST(maakRequest(maakFormData({ website: "https://spam.example" })));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockCreateSubmission).not.toHaveBeenCalled();
  });

  // Dubbele bereikbaarheid (2026-08-11): leest de door proxy.ts gezette
  // x-variant-slug-header rechtstreeks van `request.headers` (zie
  // lib/variant/get-active-variant.ts se variantSlugFromHeaders()) — geen
  // aparte, tweede implementatie van dit signaal.
  it("geeft de x-variant-slug-header door aan createContactSubmission", async () => {
    await POST(maakRequest(maakFormData(), { "x-variant-slug": "mijnmonti" }));

    expect(mockCreateSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ variantSlug: "mijnmonti" })
    );
  });

  it("valt terug op de standaardvariant-slug wanneer de header ontbreekt", async () => {
    await POST(maakRequest(maakFormData()));

    expect(mockCreateSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ variantSlug: defaultVariant.slug })
    );
  });
});

describe("POST /api/contact — non-blocking koppeling met assistant-conversations (AI Verbetercentrum)", () => {
  it("koppelt geen gesprek als er geen conversationId is meegestuurd", async () => {
    const { getPayload } = await import("payload");

    const response = await POST(maakRequest(maakFormData()));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(getPayload).not.toHaveBeenCalled();
  });

  it("zet contactFormSubmitted op het gekoppelde gesprek wanneer conversationId is meegestuurd", async () => {
    const mockUpdate = vi.fn().mockResolvedValue({});
    const { getPayload } = await import("payload");
    vi.mocked(getPayload).mockResolvedValue({ update: mockUpdate } as never);

    const response = await POST(maakRequest(maakFormData({ conversationId: "42" })));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "assistant-conversations",
        id: 42,
        overrideAccess: true,
        data: { contactFormSubmitted: true },
      })
    );
  });

  it("blijft de contactinzending als geslaagd melden, ook als de side-update naar assistant-conversations mislukt", async () => {
    const mockUpdate = vi.fn().mockRejectedValue(new Error("database niet bereikbaar"));
    const { getPayload } = await import("payload");
    vi.mocked(getPayload).mockResolvedValue({ update: mockUpdate } as never);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(maakRequest(maakFormData({ conversationId: "42" })));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.id).toBe("sub-1");
    expect(mockCreateSubmission).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it("negeert een niet-numerieke conversationId zonder de inzending te breken", async () => {
    const { getPayload } = await import("payload");

    const response = await POST(maakRequest(maakFormData({ conversationId: "niet-een-getal" })));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(getPayload).not.toHaveBeenCalled();
  });
});
