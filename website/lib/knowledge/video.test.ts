import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchTranscriptIfEasy } from "./video";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTranscriptIfEasy", () => {
  it("haalt en ontdoet een VTT-transcript van opmaak wanneer de URL platte tekst teruggeeft", async () => {
    const vtt = `WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHallo en welkom.\n\n2\n00:00:02.000 --> 00:00:04.000\nDit is de video.`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/vtt" },
        text: async () => vtt,
      })
    );

    const transcript = await fetchTranscriptIfEasy("https://voorbeeld.test/ondertitels.vtt");

    expect(transcript).toBe("Hallo en welkom. Dit is de video.");
  });

  it("geeft null terug wanneer de URL geen tekstbestand is (bv. een gewone videopagina)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        text: async () => "<html>...</html>",
      })
    );

    const transcript = await fetchTranscriptIfEasy("https://voorbeeld.test/video-pagina");

    expect(transcript).toBeNull();
  });

  it("geeft null terug bij een netwerkfout, zonder te gooien", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("netwerkfout")));

    const transcript = await fetchTranscriptIfEasy("https://voorbeeld.test/ondertitels.vtt");

    expect(transcript).toBeNull();
  });
});
