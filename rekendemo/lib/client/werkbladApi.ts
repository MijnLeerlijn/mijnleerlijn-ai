import type { WerkbladResultaat } from "@/lib/resultaat";
import type { WerkbladInstellingen } from "@/lib/werkblad";

export const ALGEMENE_FOUTMELDING =
  "Het werkblad kon niet worden gemaakt. Probeer het opnieuw.";

type ApiAntwoord = {
  resultaat?: WerkbladResultaat;
  meta?: { model: string; pogingen: number };
  fout?: { code: string; bericht: string; details?: string[] };
};

/** Roept de server-side generator aan; technische details blijven in de console. */
export async function vraagWerkbladAan(
  instellingen: WerkbladInstellingen,
): Promise<WerkbladResultaat> {
  const antwoord = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(instellingen),
  });

  const data = (await antwoord.json().catch(() => ({}))) as ApiAntwoord;

  if (!antwoord.ok || !data.resultaat) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[werkblad] genereren mislukt", data.fout ?? antwoord.status);
    }
    throw new Error(ALGEMENE_FOUTMELDING);
  }

  if (process.env.NODE_ENV !== "production" && data.meta) {
    console.info("[werkblad] gegenereerd", data.meta);
  }

  return data.resultaat;
}
