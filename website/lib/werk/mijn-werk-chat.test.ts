import { describe, it, expect, vi, beforeEach } from "vitest";
import { stelMijnWerkVraag } from "./mijn-werk-chat";
import { routeerWerkVraag } from "./context-router";
import { generateChatText } from "@/services/ai-client";
import { bouwSchoolContext, bouwSchoolPrompt } from "@/lib/sales/context";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { fetchPrimaryCalendar } from "@/lib/google-calendar/oauth";
import { fetchAgendaEventsInBereik } from "@/lib/google-calendar/api";

vi.mock("./context-router", () => ({ routeerWerkVraag: vi.fn() }));
vi.mock("@/services/ai-client", () => ({ generateChatText: vi.fn() }));
vi.mock("@/lib/sales/context", () => ({ bouwSchoolContext: vi.fn(), bouwSchoolPrompt: vi.fn() }));
vi.mock("@/lib/google-calendar/connection", () => ({ verkrijgGeldigeToegang: vi.fn() }));
vi.mock("@/lib/google-calendar/oauth", () => ({ fetchPrimaryCalendar: vi.fn() }));
vi.mock("@/lib/google-calendar/api", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-calendar/api")>();
  return { ...echt, fetchAgendaEventsInBereik: vi.fn() };
});

const mockRouteer = vi.mocked(routeerWerkVraag);
const mockChat = vi.mocked(generateChatText);
const mockSchoolContext = vi.mocked(bouwSchoolContext);
const mockSchoolPrompt = vi.mocked(bouwSchoolPrompt);
const mockToegang = vi.mocked(verkrijgGeldigeToegang);
const mockPrimary = vi.mocked(fetchPrimaryCalendar);
const mockEvents = vi.mocked(fetchAgendaEventsInBereik);

function maakFakePayload(overrides: Partial<Record<string, unknown[]>> = {}) {
  return {
    find: vi.fn(async ({ collection }: { collection: string }) => ({ docs: overrides[collection] ?? [] })),
  };
}

const VANDAAG = "2026-08-17";

beforeEach(() => {
  mockRouteer.mockReset();
  mockChat.mockReset().mockResolvedValue("AI-antwoord");
  mockSchoolContext.mockReset();
  mockSchoolPrompt.mockReset();
  mockToegang.mockReset().mockResolvedValue(null);
  mockPrimary.mockReset();
  mockEvents.mockReset();
});

describe("stelMijnWerkVraag — routering naar minimale context per categorie", () => {
  it("'planning' haalt taken/sales/agenda op, GEEN school-context (contextminimalisatie)", async () => {
    mockRouteer.mockResolvedValue({ categorie: "planning", genoemdeSchoolNaam: null });
    const payload = maakFakePayload({
      "personal-tasks": [{ titel: "Taak A", datum: "2026-08-18", tijd: null }],
      "sales-actions": [],
    });

    const resultaat = await stelMijnWerkVraag(payload as never, 1, "Wat heb ik morgen?", VANDAAG);

    expect(resultaat.categorie).toBe("planning");
    expect(mockSchoolContext).not.toHaveBeenCalled();
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ content: expect.stringContaining("Taak A") })],
      })
    );
  });

  it("'school' met een eenduidige match gebruikt UITSLUITEND bouwSchoolContext, geen bredere planningdata", async () => {
    mockRouteer.mockResolvedValue({ categorie: "school", genoemdeSchoolNaam: "Springplank" });
    const payload = maakFakePayload({ "sales-schools": [{ id: 1, schoolName: "Springplank" }] });
    mockSchoolContext.mockResolvedValue({ school: {}, recenteLogEvents: [], mijnleerlijnKennis: [], variantKennis: null } as never);
    mockSchoolPrompt.mockReturnValue({ systemPrompt: "SP", contextBericht: "Schoolcontext-blok" });

    const resultaat = await stelMijnWerkVraag(payload as never, 1, "Wat is de status bij Springplank?", VANDAAG);

    expect(resultaat.categorie).toBe("school");
    expect(mockSchoolContext).toHaveBeenCalledWith(payload, 1, "Wat is de status bij Springplank?");
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "SP", messages: [expect.objectContaining({ content: expect.stringContaining("Schoolcontext-blok") })] })
    );
  });

  it("'school' zonder eenduidige match valt terug op planningcontext, categorie wordt 'algemeen'", async () => {
    mockRouteer.mockResolvedValue({ categorie: "school", genoemdeSchoolNaam: "Onbekende school" });
    const payload = maakFakePayload({ "sales-schools": [{ id: 1, schoolName: "Springplank" }] });

    const resultaat = await stelMijnWerkVraag(payload as never, 1, "Wat is de status bij die school?", VANDAAG);

    expect(resultaat.categorie).toBe("algemeen");
    expect(mockSchoolContext).not.toHaveBeenCalled();
  });

  it("'voorbereiding' bevat geen agenda-events zonder Google-koppeling, maar crasht niet", async () => {
    mockRouteer.mockResolvedValue({ categorie: "voorbereiding", genoemdeSchoolNaam: null });
    mockToegang.mockResolvedValue(null);
    const payload = maakFakePayload({ "sales-schools": [] });

    const resultaat = await stelMijnWerkVraag(payload as never, 1, "Waar moet ik me op voorbereiden?", VANDAAG);

    expect(resultaat.categorie).toBe("voorbereiding");
    expect(mockChat).toHaveBeenCalled();
  });

  it("'voorbereiding' koppelt schoolcontext van de eerste kandidaat mét herkende school", async () => {
    mockRouteer.mockResolvedValue({ categorie: "voorbereiding", genoemdeSchoolNaam: null });
    mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1 });
    mockPrimary.mockResolvedValue({ emailAddress: "x@y.nl", timeZone: "UTC" });
    mockEvents.mockResolvedValue({
      timeZone: "UTC",
      events: [{ id: "evt1", titel: "Training bij Springplank", volledigeDag: false, datum: "2026-08-19", tijd: "09:00", eindTijd: null }],
    });
    const payload = maakFakePayload({ "sales-schools": [{ id: 1, schoolName: "Springplank" }] });
    mockSchoolContext.mockResolvedValue({ school: {}, recenteLogEvents: [], mijnleerlijnKennis: [], variantKennis: null } as never);
    mockSchoolPrompt.mockReturnValue({ systemPrompt: "SP", contextBericht: "Schoolcontext-blok" });

    await stelMijnWerkVraag(payload as never, 1, "Bereid mijn training voor.", VANDAAG);

    expect(mockSchoolContext).toHaveBeenCalledWith(payload, 1, expect.stringContaining("Training bij Springplank"));
  });

  it("valt terug op 'algemeen' (planningcontext) voor elke onbekende/overige categorie", async () => {
    mockRouteer.mockResolvedValue({ categorie: "algemeen", genoemdeSchoolNaam: null });
    const payload = maakFakePayload();

    const resultaat = await stelMijnWerkVraag(payload as never, 1, "Iets vaags", VANDAAG);
    expect(resultaat.categorie).toBe("algemeen");
    expect(mockSchoolContext).not.toHaveBeenCalled();
  });
});
