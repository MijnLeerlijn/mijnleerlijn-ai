import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { genereerAntwoordvoorstel } from "./mail-reply";
import { generateChatText } from "@/services/ai-client";
import { bouwSchoolContext, bouwSchoolPrompt } from "@/lib/sales/context";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { fetchPrimaryCalendar } from "@/lib/google-calendar/oauth";
import { fetchAgendaEventsInBereik } from "@/lib/google-calendar/api";
import { haalBerichtVoorAntwoord, haalThreadVoorAntwoord } from "@/lib/google-gmail/api";

vi.mock("@/services/ai-client", () => ({ generateChatText: vi.fn() }));
vi.mock("@/lib/sales/context", () => ({ bouwSchoolContext: vi.fn(), bouwSchoolPrompt: vi.fn() }));
vi.mock("@/lib/google-calendar/connection", () => ({ verkrijgGeldigeToegang: vi.fn() }));
vi.mock("@/lib/google-calendar/oauth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-calendar/oauth")>();
  return { ...echt, fetchPrimaryCalendar: vi.fn() };
});
vi.mock("@/lib/google-calendar/api", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-calendar/api")>();
  return { ...echt, fetchAgendaEventsInBereik: vi.fn() };
});
vi.mock("@/lib/google-gmail/api", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-gmail/api")>();
  return { ...echt, haalBerichtVoorAntwoord: vi.fn(), haalThreadVoorAntwoord: vi.fn() };
});

const mockChat = vi.mocked(generateChatText);
const mockSchoolContext = vi.mocked(bouwSchoolContext);
const mockSchoolPrompt = vi.mocked(bouwSchoolPrompt);
const mockToegang = vi.mocked(verkrijgGeldigeToegang);
const mockPrimaryCalendar = vi.mocked(fetchPrimaryCalendar);
const mockAgendaEvents = vi.mocked(fetchAgendaEventsInBereik);
const mockBericht = vi.mocked(haalBerichtVoorAntwoord);
const mockThread = vi.mocked(haalThreadVoorAntwoord);

// Handtekening (2026-08-24) — genereerAntwoordvoorstel haalt de naam van de
// eigenaar op via payload.findByID (zie mail-reply.ts) om de persoonlijke
// handtekening te vullen. Een minimale fake i.p.v. een volwaardige
// maakFakePayload()-fixture: dit is de enige Payload-aanroep in dit bestand.
const mockFindByID = vi.fn();
const fakePayload = { findByID: mockFindByID } as unknown as Payload;

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];

const BASIS_BERICHT = {
  gmailMessageId: "msg-1",
  gmailThreadId: "thread-1",
  van: "Jan Jansen <jan@school.nl>",
  onderwerp: "Vraag over de planning",
  ontvangenOp: "2026-08-17T09:00:00.000Z",
  bodyText: "Kunnen we dinsdag 14:00 afspreken?",
  messageIdHeader: "<origineel@mail.gmail.com>",
  referencesHeader: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1, scopes: GMAIL_SCOPES });
  mockBericht.mockResolvedValue(BASIS_BERICHT);
  mockThread.mockResolvedValue([BASIS_BERICHT]);
  mockChat.mockResolvedValue("Concepttekst van het antwoord.");
  mockFindByID.mockResolvedValue({ id: 1, name: "Anne Redacteur" });
});

describe("genereerAntwoordvoorstel", () => {
  it("gooit een duidelijke fout zonder actieve Google-koppeling", async () => {
    mockToegang.mockResolvedValue(null);
    await expect(genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" })).rejects.toThrow();
  });

  it("labelt de ontvangen mail als ONVERTROUWD, geen instructie", async () => {
    await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });

    const bericht = mockChat.mock.calls[0]?.[0]?.messages[0]?.content as string;
    expect(bericht).toContain("ONVERTROUWD");
    expect(bericht).toContain("Kunnen we dinsdag 14:00 afspreken?");

    const systeemprompt = mockChat.mock.calls[0]?.[0]?.systemPrompt as string;
    expect(systeemprompt).toMatch(/GEEN instructie/i);
    expect(systeemprompt).toMatch(/negeer/i);
  });

  it("geeft aan/onderwerp/threadId/threading-headers terug, afgeleid van het opgehaalde origineel", async () => {
    const resultaat = await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });

    expect(resultaat.aan).toBe("jan@school.nl");
    expect(resultaat.onderwerp).toBe("Re: Vraag over de planning");
    expect(resultaat.gmailThreadId).toBe("thread-1");
    expect(resultaat.messageIdHeader).toBe("<origineel@mail.gmail.com>");
    expect(resultaat.conceptTekst).toContain("Concepttekst van het antwoord.");
  });

  it("voegt GEEN schoolcontext toe zonder schoolId", async () => {
    await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });
    expect(mockSchoolContext).not.toHaveBeenCalled();
  });

  it("voegt schoolcontext toe (ONVERTROUWD-gelabeld door bouwSchoolPrompt) wanneer een betrouwbaar herkende school is meegegeven", async () => {
    mockSchoolContext.mockResolvedValue({ school: { id: 5, schoolName: "Springplank" } } as never);
    mockSchoolPrompt.mockReturnValue({ systemPrompt: "x", contextBericht: "[Schoolcontext — ONVERTROUWDE klantdata]\nSpringplank" });

    await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: 5, vandaag: "2026-08-17" });

    expect(mockSchoolContext).toHaveBeenCalledWith(expect.anything(), 5, expect.stringContaining("Vraag over de planning"));
    const bericht = mockChat.mock.calls[0]?.[0]?.messages[0]?.content as string;
    expect(bericht).toContain("Springplank");
  });

  it("voegt een beschikbaarheidsblok toe wanneer de koppeling de calendar-scope heeft", async () => {
    mockPrimaryCalendar.mockResolvedValue({ emailAddress: "gebruiker@mijnleerlijn.nl", timeZone: "Europe/Amsterdam" });
    mockAgendaEvents.mockResolvedValue({
      events: [{ id: "evt1", titel: "Training", volledigeDag: false, datum: "2026-08-18", tijd: "10:00", eindTijd: "11:00" }],
      timeZone: "Europe/Amsterdam",
    });
    mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1, scopes: [...GMAIL_SCOPES, CALENDAR_SCOPE] });

    await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });

    const bericht = mockChat.mock.calls[0]?.[0]?.messages[0]?.content as string;
    expect(bericht).toContain("Beschikbaarheid");
    expect(bericht).toContain("Training");
  });

  it("laat het beschikbaarheidsblok geruisloos weg zonder calendar-scope (bv. uitsluitend Gmail gekoppeld) — geen crash", async () => {
    mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1, scopes: GMAIL_SCOPES });

    await expect(genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" })).resolves.toBeDefined();
    expect(mockPrimaryCalendar).not.toHaveBeenCalled();

    const bericht = mockChat.mock.calls[0]?.[0]?.messages[0]?.content as string;
    expect(bericht).not.toContain("Beschikbaarheid");
  });

  it("laat het beschikbaarheidsblok geruisloos weg wanneer de Calendar-aanroep faalt — mag de generatie nooit blokkeren", async () => {
    mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1, scopes: [...GMAIL_SCOPES, CALENDAR_SCOPE] });
    mockPrimaryCalendar.mockRejectedValue(new Error("Google is even niet bereikbaar"));

    const resultaat = await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });
    expect(resultaat.conceptTekst).toContain("Concepttekst van het antwoord.");
  });

  it("voegt eerdere threadberichten toe wanneer de thread meer dan één bericht heeft", async () => {
    mockThread.mockResolvedValue([
      { ...BASIS_BERICHT, gmailMessageId: "msg-0", bodyText: "Eerder bericht in de conversatie." },
      BASIS_BERICHT,
    ]);

    await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });

    const bericht = mockChat.mock.calls[0]?.[0]?.messages[0]?.content as string;
    expect(bericht).toContain("Eerdere berichten in de conversatie");
    expect(bericht).toContain("Eerder bericht in de conversatie.");
  });

  it("voegt GEEN threadblok toe wanneer de thread uit uitsluitend dit ene bericht bestaat", async () => {
    mockThread.mockResolvedValue([BASIS_BERICHT]);
    await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });

    const bericht = mockChat.mock.calls[0]?.[0]?.messages[0]?.content as string;
    expect(bericht).not.toContain("Eerdere berichten in de conversatie");
  });

  describe("persoonlijke handtekening (spec §B10/§B11)", () => {
    it("gebruikt de naam van de ingelogde medewerker (eigenaarId), niet een hardcoded naam", async () => {
      mockFindByID.mockResolvedValue({ id: 1, name: "Anne Redacteur" });
      const resultaat = await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });
      expect(mockFindByID).toHaveBeenCalledWith(expect.objectContaining({ collection: "users", id: 1 }));
      expect(resultaat.conceptTekst).toContain("Anne Redacteur");
      expect(resultaat.conceptTekst).toContain("Met vriendelijke groet");
      expect(resultaat.conceptTekst).not.toContain("Michel de Hond");
    });

    it("een andere medewerker (ander eigenaarId) krijgt zijn eigen naam in de handtekening", async () => {
      mockFindByID.mockResolvedValue({ id: 2, name: "Bram Smit" });
      const resultaat = await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 2, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });
      expect(mockFindByID).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
      expect(resultaat.conceptTekst).toContain("Bram Smit");
      expect(resultaat.conceptTekst).not.toContain("Anne Redacteur");
    });

    it("valt terug op een algemene afzender als de gebruiker niet gevonden wordt", async () => {
      mockFindByID.mockResolvedValue(null);
      const resultaat = await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 999, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });
      expect(resultaat.conceptTekst).toContain("Team MijnLeerlijn");
    });

    it("bevat de vaste MijnLeerlijn-bedrijfsregel, geen verzonnen contactgegevens", async () => {
      const resultaat = await genereerAntwoordvoorstel(fakePayload, { eigenaarId: 1, gmailMessageId: "msg-1", schoolId: null, vandaag: "2026-08-17" });
      expect(resultaat.conceptTekst).toContain("sCoolsuite B.V.");
      expect(resultaat.conceptTekst).toContain("mijnleerlijn.chat");
    });
  });
});
