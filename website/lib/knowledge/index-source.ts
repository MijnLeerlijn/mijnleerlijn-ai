import { z } from "zod";
import { generateStructuredOutput } from "@/services/ai-client";
import { extractPdfText, detecteerHoofdstukken } from "./pdf";
import { fetchWebsiteText } from "./website";
import { fetchTranscriptIfEasy } from "./video";

// Kerninhoud-verwerking van één kennisbron: tekst uitlezen, samenvatten,
// trefwoorden/categorie bepalen, en voor PDF's hoofdstukken herkennen +
// per hoofdstuk samenvatten. Bewust GEEN Payload-afhankelijkheid hier — dat
// zit in lib/knowledge/process-source.ts (leest het brondocument/bestand,
// roept dit bestand aan, schrijft het resultaat weg). Die scheiding maakt
// deze functie puur en zonder database te testen, zelfde opzet als
// lib/support/analyze.ts / lib/support/dedup.ts.
//
// Zelfde OpenAI-structured-output-les als lib/support/analyze.ts (2026-07-23
// productiefout, zie het commentaar daar): het schema dat NAAR de AI gaat mag
// geen minLength/maxLength/minimum/maximum/minItems/maxItems bevatten —
// bedrijfsregels worden apart, NA ontvangst gevalideerd.

const MAX_PROMPT_CHARS = 15000;

function bouwPrompt(tekst: string): string {
  if (tekst.length <= MAX_PROMPT_CHARS) return tekst;
  const eersteDeel = tekst.slice(0, Math.floor(MAX_PROMPT_CHARS * 0.6));
  const laatsteDeel = tekst.slice(-Math.floor(MAX_PROMPT_CHARS * 0.4));
  return `${eersteDeel}\n\n[... ingekort wegens lengte ...]\n\n${laatsteDeel}`;
}

const SamenvattingSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
  category: z.string(),
});
type SamenvattingOutput = z.infer<typeof SamenvattingSchema>;
const SamenvattingValidatieSchema = z.object({
  summary: z.string().min(1),
  keywords: z.array(z.string()).max(10),
  category: z.string().min(1),
});

const HoofdstukSchema = z.object({ summary: z.string() });
const HoofdstukValidatieSchema = z.object({ summary: z.string().min(1) });

const SYSTEEMPROMPT_BRON = `Je vat een kennisbron van MijnLeerlijn samen (handleiding, video, website, release notes, FAQ of intern document) zodat andere onderdelen van het platform deze later kunnen doorzoeken.

STRIKTE REGELS:
1. Neem NOOIT namen van personen, e-mailadressen, telefoonnummers of andere persoonsgegevens over in summary, keywords of category — schrijf generiek.
2. summary is een feitelijke, beknopte samenvatting van de daadwerkelijke inhoud — verzin niets dat niet in de tekst staat.
3. keywords: maximaal 10 relevante trefwoorden, kleine letters, geen zinnen.
4. category: één korte, algemene categorienaam (bv. "profielen", "rapportages", "facturatie").

Antwoord uitsluitend met het gevraagde gestructureerde object.`;

const SYSTEEMPROMPT_HOOFDSTUK = `Je vat één hoofdstuk uit een MijnLeerlijn-document samen in 2-4 zinnen. Geen persoonsgegevens overnemen, niets verzinnen dat niet in de tekst staat. Antwoord uitsluitend met het gevraagde gestructureerde object.`;

async function samenvatten(tekst: string): Promise<SamenvattingOutput> {
  const ruw = await generateStructuredOutput({
    schema: SamenvattingSchema,
    systemPrompt: SYSTEEMPROMPT_BRON,
    userPrompt: bouwPrompt(tekst),
  });
  const validatie = SamenvattingValidatieSchema.safeParse(ruw);
  if (!validatie.success) {
    throw new Error(
      `AI-samenvatting voldeed niet aan de vereisten (${validatie.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")})`
    );
  }
  return ruw;
}

async function hoofdstukSamenvatten(tekst: string): Promise<string> {
  const ruw = await generateStructuredOutput({
    schema: HoofdstukSchema,
    systemPrompt: SYSTEEMPROMPT_HOOFDSTUK,
    userPrompt: bouwPrompt(tekst),
  });
  const validatie = HoofdstukValidatieSchema.safeParse(ruw);
  if (!validatie.success) {
    throw new Error(
      `AI-hoofdstuksamenvatting voldeed niet aan de vereisten (${validatie.error.issues.map((i) => i.message).join("; ")})`
    );
  }
  return validatie.data.summary;
}

export interface BronVoorIndexering {
  title: string;
  type: "pdf" | "video" | "website" | "release_notes" | "handleiding" | "faq" | "intern_document";
  description?: string | null;
  url?: string | null;
  transcript?: string | null;
  /** Vooraf opgeloste, absolute URL naar het geüploade bestand — alleen voor type "pdf". */
  fileUrl?: string | null;
}

export interface HoofdstukResultaat {
  title: string;
  summary: string;
  order: number;
}

export type BronUitkomst =
  | {
      type: "indexed";
      summary: string;
      keywords: string[];
      category: string;
      chapters: HoofdstukResultaat[];
      transcript?: string;
    }
  | { type: "failed"; foutmelding: string };

export async function indexeerBron(bron: BronVoorIndexering): Promise<BronUitkomst> {
  try {
    let brontekst = "";
    let chapters: HoofdstukResultaat[] = [];
    let transcript: string | undefined;

    if (bron.type === "pdf") {
      if (!bron.fileUrl) {
        return { type: "failed", foutmelding: "Geen bestand gekoppeld aan deze PDF-bron." };
      }
      const response = await fetch(bron.fileUrl);
      if (!response.ok) {
        return { type: "failed", foutmelding: `Kon PDF niet ophalen (HTTP ${response.status}).` };
      }
      const buffer = await response.arrayBuffer();
      const { paginas, volledigeTekst } = await extractPdfText(buffer);
      if (!volledigeTekst.trim()) {
        return {
          type: "failed",
          foutmelding:
            "PDF bevat geen leesbare tekst (mogelijk een scan zonder OCR-laag, of een leeg document).",
        };
      }
      brontekst = volledigeTekst;

      const ruweHoofdstukken = detecteerHoofdstukken(paginas, bron.title);
      chapters = await Promise.all(
        ruweHoofdstukken.map(async (h, i) => ({
          title: h.title,
          summary: await hoofdstukSamenvatten(h.text),
          order: i + 1,
        }))
      );
    } else if (bron.type === "video") {
      transcript = bron.transcript?.trim() || undefined;
      if (!transcript && bron.url) {
        transcript = (await fetchTranscriptIfEasy(bron.url)) ?? undefined;
      }
      brontekst = [bron.title, bron.description, transcript].filter(Boolean).join("\n\n");
      if (!brontekst.trim()) {
        return {
          type: "failed",
          foutmelding: "Geen titel, omschrijving of transcript beschikbaar om te analyseren.",
        };
      }
    } else {
      if (!bron.url) {
        return { type: "failed", foutmelding: "Geen URL ingevuld voor deze bron." };
      }
      const { text } = await fetchWebsiteText(bron.url);
      if (!text.trim()) {
        return { type: "failed", foutmelding: "Kon geen leesbare tekst ophalen van deze URL." };
      }
      brontekst = text;
    }

    const { summary, keywords, category } = await samenvatten(brontekst);

    return { type: "indexed", summary, keywords, category, chapters, transcript };
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    return { type: "failed", foutmelding: boodschap };
  }
}
