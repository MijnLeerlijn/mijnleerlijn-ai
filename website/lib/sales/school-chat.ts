import type { Payload } from "payload";
import { generateChatText } from "@/services/ai-client";
import { bouwSchoolContext, bouwSchoolPrompt } from "./context";

// Sales-assistent V1 (2026-08-14) — "Vraag AI over deze school" op het
// schooldetail. Zelfde providerabstractie als de rest van het project
// (generateChatText, services/ai-client.ts) — geen los AI-clientje.
export interface SchoolChatResultaat {
  antwoord: string;
  gebruikteKennis: { titel: string; tekst: string }[];
}

export async function stelVraagOverSchool(payload: Payload, schoolId: number, vraag: string): Promise<SchoolChatResultaat> {
  const context = await bouwSchoolContext(payload, schoolId, vraag);
  const { systemPrompt, contextBericht } = bouwSchoolPrompt(context);

  const antwoord = await generateChatText({
    systemPrompt,
    messages: [{ role: "user", content: `${contextBericht}\n\n---\n\nVraag van de gebruiker:\n${vraag}` }],
  });

  return {
    antwoord,
    gebruikteKennis: context.mijnleerlijnKennis.map((c) => ({ titel: c.title, tekst: c.text })),
  };
}
