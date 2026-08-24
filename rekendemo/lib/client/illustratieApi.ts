export type IllustratieVerzoekBody = {
  eiland: string;
  leerjaar: number;
  illustrationDescription: string;
  tekenwens: string;
};

export type Illustratie = {
  /** Data-URL (base64). Bewust geen object-URL: zo blijft de afbeelding
   *  bruikbaar bij een latere PDF-export en overleeft hij een re-render. */
  dataUrl: string;
  /** Alleen in development meegestuurd, voor het technische blok. */
  prompt?: string;
};

type ApiAntwoord = {
  afbeelding?: { dataUrl: string };
  meta?: { model: string; prompt?: string };
  fout?: { code: string; bericht: string; details?: string[] };
};

export async function vraagIllustratieAan(
  body: IllustratieVerzoekBody,
): Promise<Illustratie> {
  const antwoord = await fetch("/api/illustration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await antwoord.json().catch(() => ({}))) as ApiAntwoord;

  if (!antwoord.ok || !data.afbeelding?.dataUrl) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[illustratie] genereren mislukt", data.fout ?? antwoord.status);
    }
    throw new Error("De tekening kon niet worden gemaakt.");
  }

  return { dataUrl: data.afbeelding.dataUrl, prompt: data.meta?.prompt };
}
