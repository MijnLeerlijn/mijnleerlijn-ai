import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWebsiteText } from "./website";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWebsiteText", () => {
  it("haalt de titel en platte tekst van een echte HTML-pagina op", async () => {
    const html = `<html><head><title>Voorbeeldpagina</title></head><body><h1>Welkom</h1><p>Dit is een <b>test</b>.</p></body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => html }));

    const resultaat = await fetchWebsiteText("https://voorbeeld.test/pagina");

    expect(resultaat.title).toBe("Voorbeeldpagina");
    expect(resultaat.text).toContain("Welkom");
    expect(resultaat.text).toContain("Dit is een test");
  });

  it("gooit een fout bij een niet-succesvolle HTTP-respons", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }));

    await expect(fetchWebsiteText("https://voorbeeld.test/bestaat-niet")).rejects.toThrow(/404/);
  });
});
