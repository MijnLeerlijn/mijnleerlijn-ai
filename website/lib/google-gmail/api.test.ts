import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bareAddress, replyOnderwerp, bouwKandidaatQuery, verstuurAntwoord } from "./api";

describe("bouwKandidaatQuery — deterministisch Gmail-voorfilter", () => {
  it("gebruikt category:primary (sluit nieuwsbrieven/social/promoties/updates uit via Gmail's eigen classificatie)", () => {
    expect(bouwKandidaatQuery(3)).toContain("category:primary");
  });

  it("beperkt tot de inbox", () => {
    expect(bouwKandidaatQuery(3)).toContain("in:inbox");
  });

  it("neemt het meegegeven aantal lookbackdagen over", () => {
    expect(bouwKandidaatQuery(5)).toContain("newer_than:5d");
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
