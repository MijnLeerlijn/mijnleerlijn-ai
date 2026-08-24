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
    const uitkomst = await maakDeelLink(payload, []);
    expect(uitkomst.soort).toBe("leeg");
  });

  it("weigert meer dan de defensieve bovengrens aan berichten", async () => {
    const { payload } = maakFakePayload({});
    const teVeel = Array.from({ length: MAX_BERICHTEN_PER_DEELLINK + 1 }, (_, i) => i + 1);
    const uitkomst = await maakDeelLink(payload, teVeel);
    expect(uitkomst.soort).toBe("te_veel_berichten");
  });

  it("weigert een intern /assistant-gesprek — kan niet via de publieke route gedeeld worden (onbevoegd, spec §E)", async () => {
    const { payload } = maakFakePayload({
      "assistant-conversations": [helpdeskGesprek({ id: 1 }), helpdeskGesprek({ id: 2, source: "assistant", question: "Interne beheervraag" })],
    });
    const uitkomst = await maakDeelLink(payload, [1, 2]);
    expect(uitkomst.soort).toBe("geen_geldige_conversaties");
  });

  it("weigert een onbestaand conversationId", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const uitkomst = await maakDeelLink(payload, [1, 999]);
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
    const gemaakt = await maakDeelLink(payload, [2, 1]);
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
    const gemaakt = await maakDeelLink(payload, [1]);
    if (gemaakt.soort !== "ok") throw new Error("onverwacht mislukt");

    const uitkomst = await haalGedeeldeChat(payload, gemaakt.token);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_beschikbaar");
    expect(uitkomst.data.berichten[0]?.manuals).toEqual([{ id: zichtbareBron.id, title: zichtbareBron.title, hasFile: true }]);
  });

  it("berichten die ná het delen ontstaan, verschijnen niet in de al gemaakte snapshot (spec §A3: snapshot, geen live meekijklink)", async () => {
    const { payload } = maakFakePayload({ "assistant-conversations": [helpdeskGesprek({ id: 1 })] });
    const gemaakt = await maakDeelLink(payload, [1]);
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
    const eerste = await maakDeelLink(payload, [1]);
    const tweede = await maakDeelLink(payload, [1]);
    if (eerste.soort !== "ok" || tweede.soort !== "ok") throw new Error("onverwacht mislukt");

    expect(eerste.token).not.toBe(tweede.token);

    // Elke snapshot afzonderlijk intrekbaar — de ander blijft werken.
    await trekDeelLinkIn(payload, eerste.token);
    const eersteNa = await haalGedeeldeChat(payload, eerste.token);
    const tweedeNa = await haalGedeeldeChat(payload, tweede.token);
    expect(eersteNa.soort).toBe("niet_beschikbaar");
    expect(tweedeNa.soort).toBe("ok");
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
    const gemaakt = await maakDeelLink(payload, [1]);
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
    const gemaakt = await maakDeelLink(payload, [1]);
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
    const gemaakt = await maakDeelLink(payload, [1]);
    if (gemaakt.soort !== "ok") throw new Error("onverwacht mislukt");

    const resultaat = await payload.find({ collection: "gedeelde-chats", where: {}, limit: 10 });
    const opgeslagenRecord = resultaat.docs[0] as { tokenHash: string };
    expect(opgeslagenRecord.tokenHash).toBe(hashDeelToken(gemaakt.token));
    expect(opgeslagenRecord.tokenHash).not.toBe(gemaakt.token);
    expect(JSON.stringify(opgeslagenRecord)).not.toContain(gemaakt.token);
  });
});
