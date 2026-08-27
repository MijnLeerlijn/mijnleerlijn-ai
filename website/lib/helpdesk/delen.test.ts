import { describe, it, expect } from "vitest";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { maakDeelLink, haalGedeeldeChat, trekDeelLinkIn, MAX_BERICHTEN_PER_DEELLINK } from "./delen";
import { genereerDeelToken, hashDeelToken } from "./deel-token";

// Chat delen via URL (2026-08-24) — spec §E. De publieke Helpdesk-chat heeft
// geen login/eigenaar (zie lib/assistant/process-public-question.ts: elk
// gesprek heeft user: null) — "ingelogde gebruiker kan eigen/toegestane chat
// delen; onbevoegde gebruiker kan chat van ander niet delen" wordt hier dus
// vertaald naar de daadwerkelijke toegangsgrens van dit bestand: uitsluitend
// conversationId's met source "helpdesk" zijn deelbaar, een intern
// /assistant-gesprek (source "assistant", wél login-gebonden) kan nooit via
// deze publieke route lekken — zie de toelichting in lib/helpdesk/delen.ts.

function helpdeskGesprek(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    source: "helpdesk",
    question: "Waar vind ik het leerdoelenoverzicht?",
    answer: "Je vindt het leerdoelenoverzicht via **Instellingen > Overzichten**.",
    hasAnswer: true,
    sources: [],
    steps: [],
    createdAt: "2026-08-24T09:00:00.000Z",
    ...overrides,
  };
}

const zichtbareBron = { id: 10, title: "Handleiding Leerdoelenoverzicht", type: "handleiding", zichtbaar: true, file: 55 };
const verborgenBron = { id: 11, title: "Interne notitie", type: "intern_document", zichtbaar: false, file: null };

describe("maakDeelLink", () => {
  it("weigert een lege lijst conversationId's", async () => {
    const { payload } = maakFakePayload({});
    const uitkomst = await maakDeelLink(payload, { conversationIds: [] });
    expect(uitkomst.soort).toBe("leeg");
  });

  it("weigert meer dan de defensieve bovengrens aan berichten", async () => {
    const { payload } = maakFakePayload({});
    const teVeel = Array.from({ length: MAX_BERICHTEN_PER_DEELLINK + 1 }, (_, i) => i + 1);
    const uitkomst = await maakDeelLink(payload, { conversationIds: teVeel });
    expect(uitkomst.soort).toBe("te_veel_berichten");
  });

  it("weigert een intern /assistant-gesprek — kan niet via de publieke route gedeeld worden (onbevoegd, spec §E)", async () => {
    const { payload } = maakFakePayload({
      "assistant-conversations": [helpdeskGesprek({ id: 1 }), helpdeskGesprek({ id: 2, source: "assistant", question: "Interne beheervraag" })],
    });
    const uitkomst = await maakDeelLink(payload, { conversationIds: [1, 2] });
    expect(uitkomst.soort).toBe("geen_geldige_conversaties");
  });

  it("weigert een onbestaand conversationId", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const uitkomst = await maakDeelLink(payload, { conversationIds: [1, 999] });
    expect(uitkomst.soort).toBe("geen_geldige_conversaties");
  });

  it("maakt een snapshot met de volledige zichtbare chat, in chronologische volgorde (niet de aangeleverde arrayvolgorde)", async () => {
    const { payload } = maakFakePayload({
      "assistant-conversations": [
        helpdeskGesprek({ id: 1, question: "Eerste vraag", answer: "Eerste antwoord", createdAt: "2026-08-24T09:00:00.000Z" }),
        helpdeskGesprek({ id: 2, question: "Tweede vraag", answer: "Tweede antwoord", createdAt: "2026-08-24T09:05:00.000Z" }),
      ],
    });
    // Bewust in omgekeerde volgorde aangeleverd — de server moet zelf op createdAt sorteren.
    const gemaakt = await maakDeelLink(payload, { conversationIds: [2, 1] });
    if (gemaakt.soort !== "ok") throw new Error("onverwacht mislukt");

    const uitkomst = await haalGedeeldeChat(payload, gemaakt.token);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(uitkomst.data.berichten.map((b) => b.vraag)).toEqual(["Eerste vraag", "Tweede vraag"]);
    expect(uitkomst.data.berichten.map((b) => b.antwoord)).toEqual(["Eerste antwoord", "Tweede antwoord"]);
  });

  it("herbouwt alleen zichtbare handleidingen als manuals — een niet-zichtbare bron wordt uitgesloten", async () => {
    const { payload } = maakFakePayload({
      "assistant-conversations": [
        helpdeskGesprek({
          sources: [
            { refCollection: "knowledge-sources", refId: zichtbareBron.id },
            { refCollection: "knowledge-sources", refId: verborgenBron.id },
          ],
        }),
      ],
      "knowledge-sources": [zichtbareBron, verborgenBron],
    });
    const gemaakt = await maakDeelLink(payload, { conversationIds: [1] });
    if (gemaakt.soort !== "ok") throw new Error("onverwacht mislukt");

    const uitkomst = await haalGedeeldeChat(payload, gemaakt.token);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(uitkomst.data.berichten[0]?.manuals).toEqual([{ id: zichtbareBron.id, title: zichtbareBron.title, hasFile: true }]);
  });

  it("berichten die ná het delen ontstaan, verschijnen niet in de al gemaakte snapshot (spec §A3: snapshot, geen live meekijklink)", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const gemaakt = await maakDeelLink(payload, { conversationIds: [1] });
    if (gemaakt.soort !== "ok") throw new Error("onverwacht mislukt");

    // Simuleert dat de bezoeker ná het delen verder praat — een nieuw record in dezelfde "chat".
    await payload.create({
      collection: "assistant-conversations",
      data: helpdeskGesprek({ id: 2, question: "Vervolgvraag ná het delen", answer: "Nieuw antwoord" }),
    } as Parameters<typeof payload.create>[0]);

    const uitkomst = await haalGedeeldeChat(payload, gemaakt.token);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(uitkomst.data.berichten).toHaveLength(1);
    expect(uitkomst.data.berichten.some((b) => b.vraag === "Vervolgvraag ná het delen")).toBe(false);
  });

  it("een tweede share van hetzelfde gesprek levert een eigen, onafhankelijke snapshot/token op", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const eerste = await maakDeelLink(payload, { conversationIds: [1] });
    const tweede = await maakDeelLink(payload, { conversationIds: [1] });
    if (eerste.soort !== "ok" || tweede.soort !== "ok") throw new Error("onverwacht mislukt");

    expect(eerste.token).not.toBe(tweede.token);

    // Elke snapshot afzonderlijk intrekbaar — de ander blijft werken.
    await trekDeelLinkIn(payload, eerste.token);
    const eersteNa = await haalGedeeldeChat(payload, eerste.token);
    const tweedeNa = await haalGedeeldeChat(payload, tweede.token);
    expect(eersteNa.soort).toBe("niet_beschikbaar");
    expect(tweedeNa.soort).toBe("ok");
  });

  it("legt hasAnswer per bericht vast — een 'geen antwoord'-bericht blijft dat ook in de snapshot", async () => {
    const { payload } = maakFakePayload({
      "assistant-conversations": [helpdeskGesprek({ id: 1, hasAnswer: false, answer: "Dat weet ik niet. Er is onvoldoende informatie in de kennisbank." })],
    });
    const gemaakt = await maakDeelLink(payload, { conversationIds: [1] });
    if (gemaakt.soort !== "ok") throw new Error("onverwacht mislukt");

    const uitkomst = await haalGedeeldeChat(payload, gemaakt.token);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(uitkomst.data.berichten[0]?.hasAnswer).toBe(false);
  });
});

describe("maakDeelLink — verder delen vanuit een al gedeeld gesprek (parentToken, spec-eis §6/§7)", () => {
  it("een fork erft de bevroren berichten van de ouder-link, vóór de eigen nieuwe berichten, zonder de ouder-rij zelf te wijzigen", async () => {
    const { payload } = maakFakePayload({
      "assistant-conversations": [helpdeskGesprek({ id: 1, question: "Eerste vraag", answer: "Eerste antwoord" })],
    });
    const ouder = await maakDeelLink(payload, { conversationIds: [1] });
    if (ouder.soort !== "ok") throw new Error("onverwacht mislukt");

    // De ontvanger stelt zelf een nieuwe vraag (een nieuw, eigen conversationId — nooit de ouder-rij zelf).
    await payload.create({
      collection: "assistant-conversations",
      data: helpdeskGesprek({ id: 2, question: "Vervolgvraag van de ontvanger", answer: "Nieuw antwoord" }),
    } as Parameters<typeof payload.create>[0]);

    const fork = await maakDeelLink(payload, { conversationIds: [2], parentToken: ouder.token });
    if (fork.soort !== "ok") throw new Error("onverwacht mislukt");
    expect(fork.token).not.toBe(ouder.token);

    const forkData = await haalGedeeldeChat(payload, fork.token);
    if (forkData.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(forkData.data.berichten.map((b) => b.vraag)).toEqual(["Eerste vraag", "Vervolgvraag van de ontvanger"]);

    // De ouder-link zelf blijft ongewijzigd — nooit stilzwijgend bijgewerkt (spec-eis §6: fork, geen wijziging).
    const ouderDataNa = await haalGedeeldeChat(payload, ouder.token);
    if (ouderDataNa.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(ouderDataNa.data.berichten.map((b) => b.vraag)).toEqual(["Eerste vraag"]);
  });

  it("kan zonder eigen nieuwe berichten — puur de ouder opnieuw delen onder een nieuwe token", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const ouder = await maakDeelLink(payload, { conversationIds: [1] });
    if (ouder.soort !== "ok") throw new Error("onverwacht mislukt");

    const fork = await maakDeelLink(payload, { conversationIds: [], parentToken: ouder.token });
    if (fork.soort !== "ok") throw new Error("onverwacht mislukt");

    const forkData = await haalGedeeldeChat(payload, fork.token);
    if (forkData.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(forkData.data.berichten).toHaveLength(1);
  });

  it("een onbekende/ongeldige parentToken levert 'ongeldige_bron' op — nooit stilzwijgend zonder de geërfde inhoud delen", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const uitkomst = await maakDeelLink(payload, { conversationIds: [1], parentToken: "een-token-die-nooit-heeft-bestaan" });
    expect(uitkomst.soort).toBe("ongeldige_bron");
  });

  it("een fork mag óók vanaf een inmiddels ingetrokken ouder-link — de ontvanger had de inhoud al legitiem, intrekken stopt uitsluitend NIEUWE toegang via de oude link", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const ouder = await maakDeelLink(payload, { conversationIds: [1] });
    if (ouder.soort !== "ok") throw new Error("onverwacht mislukt");
    await trekDeelLinkIn(payload, ouder.token);

    const fork = await maakDeelLink(payload, { conversationIds: [], parentToken: ouder.token });
    expect(fork.soort).toBe("ok");
  });

  it("de opgetelde lengte (geërfd + nieuw) blijft begrensd op MAX_BERICHTEN_PER_DEELLINK", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const ouder = await maakDeelLink(payload, { conversationIds: [1] });
    if (ouder.soort !== "ok") throw new Error("onverwacht mislukt");

    const teVeel = Array.from({ length: MAX_BERICHTEN_PER_DEELLINK }, (_, i) => i + 100);
    const uitkomst = await maakDeelLink(payload, { conversationIds: teVeel, parentToken: ouder.token });
    expect(uitkomst.soort).toBe("te_veel_berichten");
  });

  it("kettingdelen (Wessel deelt zijn fork verder) blijft werken — de tweede fork erft de VOLLEDIGE, al samengevoegde geschiedenis", async () => {
    const { payload } = maakFakePayload({
      "assistant-conversations": [helpdeskGesprek({ id: 1, question: "Vraag A", answer: "Antwoord A" })],
    });
    const eerste = await maakDeelLink(payload, { conversationIds: [1] });
    if (eerste.soort !== "ok") throw new Error("onverwacht mislukt");

    await payload.create({
      collection: "assistant-conversations",
      data: helpdeskGesprek({ id: 2, question: "Vraag B (Wessel)", answer: "Antwoord B" }),
    } as Parameters<typeof payload.create>[0]);
    const tweede = await maakDeelLink(payload, { conversationIds: [2], parentToken: eerste.token });
    if (tweede.soort !== "ok") throw new Error("onverwacht mislukt");

    await payload.create({
      collection: "assistant-conversations",
      data: helpdeskGesprek({ id: 3, question: "Vraag C (nog een ontvanger)", answer: "Antwoord C" }),
    } as Parameters<typeof payload.create>[0]);
    const derde = await maakDeelLink(payload, { conversationIds: [3], parentToken: tweede.token });
    if (derde.soort !== "ok") throw new Error("onverwacht mislukt");

    const derdeData = await haalGedeeldeChat(payload, derde.token);
    if (derdeData.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(derdeData.data.berichten.map((b) => b.vraag)).toEqual(["Vraag A", "Vraag B (Wessel)", "Vraag C (nog een ontvanger)"]);
  });
});

describe("haalGedeeldeChat — publieke respons", () => {
  it("geeft niet_beschikbaar terug voor een onbekende token", async () => {
    const { payload } = maakFakePayload({});
    const uitkomst = await haalGedeeldeChat(payload, "onbekende-token-die-nooit-bestond");
    expect(uitkomst.soort).toBe("niet_beschikbaar");
  });

  it("bevat uitsluitend weergavevelden — nooit tokenHash, bronConversaties, of een intern record-ID", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const gemaakt = await maakDeelLink(payload, { conversationIds: [1] });
    if (gemaakt.soort !== "ok") throw new Error("onverwacht mislukt");

    const uitkomst = await haalGedeeldeChat(payload, gemaakt.token);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(uitkomst.data).not.toHaveProperty("tokenHash");
    expect(uitkomst.data).not.toHaveProperty("bronConversaties");
    expect(uitkomst.data).not.toHaveProperty("id");
    expect(Object.keys(uitkomst.data).sort()).toEqual(["berichten", "gedeeldOp"]);
  });
});

describe("trekDeelLinkIn", () => {
  it("maakt de link onmiddellijk ongeldig", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const gemaakt = await maakDeelLink(payload, { conversationIds: [1] });
    if (gemaakt.soort !== "ok") throw new Error("onverwacht mislukt");

    expect((await haalGedeeldeChat(payload, gemaakt.token)).soort).toBe("ok");
    const uitkomstIntrekken = await trekDeelLinkIn(payload, gemaakt.token);
    expect(uitkomstIntrekken).toBe("ingetrokken");
    expect((await haalGedeeldeChat(payload, gemaakt.token)).soort).toBe("niet_beschikbaar");
  });

  it("is idempotent: intrekken van een al ingetrokken/onbekende token geeft hetzelfde nette resultaat, geen fout", async () => {
    const { payload } = maakFakePayload({});
    const uitkomst = await trekDeelLinkIn(payload, "een-token-die-nooit-heeft-bestaan");
    expect(uitkomst).toBe("niet_gevonden");
  });
});

describe("token-security (spec §A4/§E: 'token is niet voorspelbaar')", () => {
  it("genereert lange, unieke tokens — geen oplopende ID's", () => {
    const tokens = Array.from({ length: 200 }, () => genereerDeelToken());
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(40);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("slaat nooit de ruwe token op — uitsluitend de sha256-hash, en die hash is niet naar de ruwe token terug te rekenen als los veld", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const gemaakt = await maakDeelLink(payload, { conversationIds: [1] });
    if (gemaakt.soort !== "ok") throw new Error("onverwacht mislukt");

    const resultaat = await payload.find({ collection: "gedeelde-chats", where: {}, limit: 10 });
    const opgeslagenRecord = resultaat.docs[0] as { tokenHash: string };
    expect(opgeslagenRecord.tokenHash).toBe(hashDeelToken(gemaakt.token));
    expect(opgeslagenRecord.tokenHash).not.toBe(gemaakt.token);
    expect(JSON.stringify(opgeslagenRecord)).not.toContain(gemaakt.token);
  });
});
