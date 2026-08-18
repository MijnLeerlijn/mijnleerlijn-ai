import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  bareAddress,
  replyOnderwerp,
  bouwKandidaatQuery,
  verstuurAntwoord,
  haalThreadBerichtenSamenvatting,
  laatsteThreadBericht,
  haalOngelezenAantal,
  type ThreadBerichtSamenvatting,
} from "./api";

describe("bouwKandidaatQuery — deterministisch Gmail-voorfilter (productiecorrectie 2026-08-18)", () => {
  it("gebruikt NIET category:primary — dat sluit accounts zonder Gmail-tabbladen/categorieën volledig uit (root cause van 'geen mailsignalen')", () => {
    expect(bouwKandidaatQuery(3)).not.toContain("category:primary");
  });

  it("sluit uitsluitend de near-zeker-ruis-categorieën deterministisch uit (promotions/social) — Updates/Forums blijven kandidaat, de AI-classificatie beslist daar", () => {
    const query = bouwKandidaatQuery(3);
    expect(query).toContain("-category:promotions");
    expect(query).toContain("-category:social");
    expect(query).not.toContain("-category:updates");
    expect(query).not.toContain("-category:forums");
  });

  it("sluit voor de hand liggende no-reply/automatische afzenders uit", () => {
    const query = bouwKandidaatQuery(3);
    expect(query).toContain("-from:noreply");
    expect(query).toContain("-from:no-reply");
    expect(query).toContain("-from:donotreply");
  });

  it("beperkt tot de inbox", () => {
    expect(bouwKandidaatQuery(3)).toContain("in:inbox");
  });

  it("neemt het meegegeven aantal lookbackdagen over", () => {
    expect(bouwKandidaatQuery(5)).toContain("newer_than:5d");
  });
});

function threadBericht(overrides: Partial<ThreadBerichtSamenvatting> & { gmailMessageId: string }): ThreadBerichtSamenvatting {
  return { van: "iemand@school.nl", onderwerp: "Onderwerp", snippet: "Fragment", vanEigenAccount: false, ontvangenOp: "2026-08-19T09:00:00.000Z", ...overrides };
}

describe("laatsteThreadBericht — chronologisch laatste bericht (productiecorrectie 2026-08-19, punt 1)", () => {
  it("geeft null terug voor een lege thread", () => {
    expect(laatsteThreadBericht([])).toBeNull();
  });

  it("bepaalt het laatste bericht op basis van ontvangenOp, niet op basis van array-volgorde", () => {
    const berichten = [
      threadBericht({ gmailMessageId: "later", ontvangenOp: "2026-08-19T12:00:00.000Z" }),
      threadBericht({ gmailMessageId: "vroeger", ontvangenOp: "2026-08-18T09:00:00.000Z" }),
    ];
    // "later" staat als EERSTE in de array, maar is wel degelijk het laatste bericht — bewust niet op API-volgorde vertrouwd.
    expect(laatsteThreadBericht(berichten)?.gmailMessageId).toBe("later");
  });
});

describe("haalThreadBerichtenSamenvatting — deterministische 'wie stuurde het laatste bericht'-controle", () => {
  const oorspronkelijkeFetch = global.fetch;

  afterEach(() => {
    global.fetch = oorspronkelijkeFetch;
  });

  it("herkent een eigen verzonden bericht aan het SENT-label, niet aan de From-header", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: "msg-1",
            threadId: "thread-1",
            internalDate: "1755600000000",
            labelIds: ["INBOX"],
            payload: { headers: [{ name: "From", value: "Ouder <ouder@school.nl>" }, { name: "Subject", value: "Vraag" }] },
          },
          {
            id: "msg-2",
            threadId: "thread-1",
            internalDate: "1755686400000",
            labelIds: ["SENT"],
            // Bewust een From-header die NIET op "Michel" lijkt (bv. verzonden via een alias) — SENT-label moet toch leidend zijn, ga niet op de displaynaam af.
            payload: { headers: [{ name: "From", value: "Info Alias <info@andere-alias.nl>" }, { name: "Subject", value: "Re: Vraag" }] },
          },
        ],
      }),
    });

    const berichten = await haalThreadBerichtenSamenvatting("token", "thread-1");

    expect(berichten).toHaveLength(2);
    expect(berichten.find((b) => b.gmailMessageId === "msg-1")?.vanEigenAccount).toBe(false);
    expect(berichten.find((b) => b.gmailMessageId === "msg-2")?.vanEigenAccount).toBe(true);
  });

  it("gebruikt format=metadata (geen volledige MIME-boom) — licht genoeg om per actief signaal te draaien", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) });

    await haalThreadBerichtenSamenvatting("token", "thread-1");

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain("format=metadata");
    expect(url).not.toContain("format=full");
  });
});

describe("haalOngelezenAantal — transparantieregel, live/deterministisch, geen classificatie (productiecorrectie 2026-08-19)", () => {
  const oorspronkelijkeFetch = global.fetch;

  afterEach(() => {
    global.fetch = oorspronkelijkeFetch;
  });

  it("leest messagesUnread van het INBOX-label, niet een zelf-opgetelde lijst", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "INBOX", messagesUnread: 3, messagesTotal: 120 }) });

    const aantal = await haalOngelezenAantal("token");

    expect(aantal).toBe(3);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain("/labels/INBOX");
  });

  it("valt terug op 0 wanneer messagesUnread ontbreekt in de respons", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "INBOX" }) });
    expect(await haalOngelezenAantal("token")).toBe(0);
  });
});

describe("bareAddress — haalt het adres uit een 'Naam <adres>'-headerwaarde", () => {
  it("haalt het adres uit tussen de haakjes", () => {
    expect(bareAddress("Jan Jansen <jan@school.nl>")).toBe("jan@school.nl");
  });

  it("valt terug op de volledige waarde zonder haakjes", () => {
    expect(bareAddress("jan@school.nl")).toBe("jan@school.nl");
  });
});

describe("replyOnderwerp", () => {
  it("zet 'Re: ' ervoor wanneer dat nog niet aanwezig is", () => {
    expect(replyOnderwerp("Vraag over de planning")).toBe("Re: Vraag over de planning");
  });

  it("dupliceert 'Re:' niet wanneer het onderwerp al met Re: begint", () => {
    expect(replyOnderwerp("Re: Vraag over de planning")).toBe("Re: Vraag over de planning");
    expect(replyOnderwerp("RE: Vraag")).toBe("RE: Vraag");
  });
});

function decodeerVerzondenMime(rawBase64Url: string): string {
  return Buffer.from(rawBase64Url, "base64url").toString("utf-8");
}

describe("verstuurAntwoord — bouwt de RFC 2822-MIME-body en threading correct op", () => {
  const oorspronkelijkeFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "verzonden-id-1" }) });
  });

  afterEach(() => {
    global.fetch = oorspronkelijkeFetch;
  });

  it("stuurt threadId mee zodat het antwoord in dezelfde Gmail-conversatie verschijnt", async () => {
    await verstuurAntwoord("token", {
      oorspronkelijkeAfzender: "Jan Jansen <jan@school.nl>",
      onderwerp: "Vraag over de planning",
      bodyText: "Hallo Jan, dat kan.",
      gmailThreadId: "thread-123",
      inReplyToMessageId: "<origineel@mail.gmail.com>",
      referencesHeader: "",
    });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const verzondenBody = JSON.parse(call[1].body as string);
    expect(verzondenBody.threadId).toBe("thread-123");
  });

  it("zet To op het herleide adres (niet de weergavenaam) en Subject met Re:-prefix", async () => {
    await verstuurAntwoord("token", {
      oorspronkelijkeAfzender: "Jan Jansen <jan@school.nl>",
      onderwerp: "Vraag over de planning",
      bodyText: "Hallo Jan, dat kan.",
      gmailThreadId: "thread-123",
      inReplyToMessageId: "<origineel@mail.gmail.com>",
      referencesHeader: "",
    });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const verzondenBody = JSON.parse(call[1].body as string);
    const mime = decodeerVerzondenMime(verzondenBody.raw);

    expect(mime).toContain("To: jan@school.nl");
    expect(mime).toContain("Subject: Re: Vraag over de planning");
  });

  it("zet In-Reply-To en breidt References uit met het originele Message-ID (correcte threading in externe mailclients)", async () => {
    await verstuurAntwoord("token", {
      oorspronkelijkeAfzender: "jan@school.nl",
      onderwerp: "Re: Vraag",
      bodyText: "Prima.",
      gmailThreadId: "thread-123",
      inReplyToMessageId: "<origineel@mail.gmail.com>",
      referencesHeader: "<eerder@mail.gmail.com>",
    });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const mime = decodeerVerzondenMime(JSON.parse(call[1].body as string).raw);

    expect(mime).toContain("In-Reply-To: <origineel@mail.gmail.com>");
    expect(mime).toContain("References: <eerder@mail.gmail.com> <origineel@mail.gmail.com>");
  });

  it("zet GEEN In-Reply-To/References wanneer er geen origineel Message-ID is (eerste bericht in een thread)", async () => {
    await verstuurAntwoord("token", {
      oorspronkelijkeAfzender: "jan@school.nl",
      onderwerp: "Vraag",
      bodyText: "Hoi.",
      gmailThreadId: "thread-123",
      inReplyToMessageId: "",
      referencesHeader: "",
    });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const mime = decodeerVerzondenMime(JSON.parse(call[1].body as string).raw);

    expect(mime).not.toContain("In-Reply-To:");
    expect(mime).not.toContain("References:");
  });

  it("codeert een niet-ASCII onderwerp als RFC 2047 encoded-word, en base64-encodeert de body (Content-Transfer-Encoding: base64)", async () => {
    await verstuurAntwoord("token", {
      oorspronkelijkeAfzender: "jan@school.nl",
      onderwerp: "Afspraak over Montessorischool",
      bodyText: "Beste Jan, dat komt goed.",
      gmailThreadId: "thread-123",
      inReplyToMessageId: "",
      referencesHeader: "",
    });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const mime = decodeerVerzondenMime(JSON.parse(call[1].body as string).raw);

    expect(mime).toContain("Content-Transfer-Encoding: base64");
    expect(mime).toContain(Buffer.from("Beste Jan, dat komt goed.", "utf-8").toString("base64"));
  });

  it("gooit een duidelijke fout wanneer Gmail een foutstatus teruggeeft", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "insufficient scope" });

    await expect(
      verstuurAntwoord("token", {
        oorspronkelijkeAfzender: "jan@school.nl",
        onderwerp: "Vraag",
        bodyText: "Hoi.",
        gmailThreadId: "thread-123",
        inReplyToMessageId: "",
        referencesHeader: "",
      })
    ).rejects.toThrow(/mislukt/);
  });
});
