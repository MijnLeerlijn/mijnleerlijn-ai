import type { Bron } from "@/lib/data/sources";

// Cliëntzijdige wrapper rond app/api/antwoord/route.ts (services/retrieval.ts
// + services/ai.ts, echte content) — zelfde resultaatvorm als de eerdere
// dummy-simulatie (lib/search/simulate.ts) zodat SearchPanel/ZoekenClient
// ongewijzigd konden blijven op vorm, alleen de databron is nu echt.
export type ZoekResultaat =
  | { type: "antwoord"; vraag: string; antwoord: string; bronnen: Bron[]; suggesties?: string[] }
  | { type: "geen-antwoord"; vraag: string; gerelateerd: string[] }
  | { type: "fout"; vraag: string };

export async function zoekEcht(vraag: string): Promise<ZoekResultaat> {
  try {
    const response = await fetch("/api/antwoord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vraag }),
    });
    if (!response.ok) return { type: "fout", vraag };
    return (await response.json()) as ZoekResultaat;
  } catch {
    return { type: "fout", vraag };
  }
}
