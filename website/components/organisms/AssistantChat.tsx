"use client";

import { useEffect, useState, type FormEvent } from "react";
import AssistantSourceList from "@/components/molecules/AssistantSourceList";
import AssistantFeedback from "@/components/molecules/AssistantFeedback";

interface GesprekSamenvatting {
  id: number;
  question: string;
  hasAnswer: boolean;
  confidence: number;
  createdAt: string;
}

interface Bron {
  label: string;
  title: string;
  chapterTitle?: string | null;
  similarity: number;
  url: string;
}

interface Antwoord {
  conversationId: number;
  question: string;
  hasAnswer: boolean;
  answer: string;
  reasoning: string;
  confidence: number;
  sources: Bron[];
}

type Status = "leeg" | "laden" | "resultaat" | "fout";

// ChatGPT-achtige interface voor de AI-assistent — zie de opdracht: links
// een lijst eerdere gesprekken, rechts de chat zelf. Elk "gesprek" is hier
// bewust één vraag/antwoord-uitwisseling (geen doorlopend, meertraps
// gesprek met conversationele context) — dat is precies wat de opgegeven
// werking beschrijft (vraag → embedding → search → context → antwoord),
// zonder vervolgvragen die op eerdere antwoorden voortbouwen. Klikken op een
// eerder gesprek in de zijbalk laadt dat vraag/antwoord read-only in het
// hoofdpaneel; een nieuwe vraag stelt begint altijd een nieuwe uitwisseling.
export default function AssistantChat({ gebruikerNaam }: { gebruikerNaam: string }) {
  const [gesprekken, setGesprekken] = useState<GesprekSamenvatting[]>([]);
  const [vraag, setVraag] = useState("");
  const [status, setStatus] = useState<Status>("leeg");
  const [antwoord, setAntwoord] = useState<Antwoord | null>(null);
  const [foutmelding, setFoutmelding] = useState("");

  useEffect(() => {
    laadGesprekken();
  }, []);

  async function laadGesprekken() {
    try {
      const res = await fetch("/api/assistant/conversations", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: GesprekSamenvatting[] };
      setGesprekken(data.conversations);
    } catch {
      // Zijbalk blijft leeg — geen blokkerende fout voor de rest van het scherm.
    }
  }

  async function stelVraag(event: FormEvent) {
    event.preventDefault();
    const tekst = vraag.trim();
    if (!tekst || status === "laden") return;

    setStatus("laden");
    setFoutmelding("");
    try {
      const res = await fetch("/api/assistant/ask", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: tekst }),
      });
      const data = await res.json();
      if (!res.ok || "error" in data) {
        setFoutmelding(
          "error" in data ? data.error : "De assistent is nu niet bereikbaar. Probeer het later opnieuw."
        );
        setStatus("fout");
        return;
      }
      setAntwoord({ ...data, question: tekst });
      setStatus("resultaat");
      setVraag("");
      laadGesprekken();
    } catch {
      setFoutmelding("De assistent is nu niet bereikbaar. Probeer het later opnieuw.");
      setStatus("fout");
    }
  }

  async function openGesprek(id: number) {
    setStatus("laden");
    setFoutmelding("");
    try {
      const res = await fetch(`/api/assistant/conversations/${id}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || "error" in data) {
        setFoutmelding("Kon dit gesprek niet laden.");
        setStatus("fout");
        return;
      }
      setAntwoord({
        conversationId: data.id,
        question: data.question,
        hasAnswer: data.hasAnswer,
        answer: data.answer,
        reasoning: data.reasoning,
        confidence: data.confidence,
        sources: data.sources ?? [],
      });
      setStatus("resultaat");
    } catch {
      setFoutmelding("Kon dit gesprek niet laden.");
      setStatus("fout");
    }
  }

  function nieuweVraag() {
    setAntwoord(null);
    setStatus("leeg");
    setFoutmelding("");
    setVraag("");
  }

  return (
    <div className="flex h-screen bg-white">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-grijs-200 bg-grijs-50 md:flex">
        <div className="flex items-center justify-between border-b border-grijs-200 p-4">
          <span className="text-sm font-semibold text-grijs-900">Gesprekken</span>
          <button type="button" onClick={nieuweVraag} className="text-sm text-blauw hover:underline">
            + Nieuw
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2" aria-label="Eerdere gesprekken">
          {gesprekken.length === 0 && <p className="p-2 text-sm text-grijs-500">Nog geen gesprekken.</p>}
          <ul className="flex flex-col gap-1">
            {gesprekken.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => openGesprek(g.id)}
                  className="w-full truncate rounded-md p-2 text-left text-sm text-grijs-700 hover:bg-white"
                >
                  {g.question}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-grijs-200 px-6 py-4">
          <h1 className="text-base font-semibold text-grijs-900">MijnLeerlijn AI Assistant</h1>
          <span className="text-sm text-grijs-500">Ingelogd als {gebruikerNaam}</span>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {status === "leeg" && (
            <p className="text-sm text-grijs-500">
              Stel een vraag over MijnLeerlijn. De assistent antwoordt uitsluitend op basis van de kennisbank.
            </p>
          )}

          {status === "laden" && <p className="text-sm text-grijs-500">Bezig met zoeken en antwoorden…</p>}

          {status === "fout" && <p className="text-sm text-rood">{foutmelding}</p>}

          {status === "resultaat" && antwoord && (
            <div className="flex flex-col gap-4">
              <div className="ml-auto max-w-lg rounded-lg bg-blauw px-4 py-2 text-sm text-white">
                {antwoord.question}
              </div>

              <div className="max-w-2xl rounded-lg border border-grijs-200 p-4">
                <p className="whitespace-pre-wrap text-sm text-grijs-900">{antwoord.answer}</p>

                {antwoord.reasoning && (
                  <p className="mt-3 text-xs text-grijs-500">
                    <span className="font-semibold">Waarom dit antwoord: </span>
                    {antwoord.reasoning}
                  </p>
                )}

                <p className="mt-1 text-xs text-grijs-500">Confidence: {antwoord.confidence}%</p>

                <AssistantSourceList bronnen={antwoord.sources} />

                <div className="mt-3">
                  <AssistantFeedback conversationId={antwoord.conversationId} />
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={stelVraag} className="flex gap-2 border-t border-grijs-200 p-4">
          <input
            type="text"
            value={vraag}
            onChange={(e) => setVraag(e.target.value)}
            placeholder="Typ je vraag..."
            className="flex-1 rounded-md border border-grijs-200 px-3 py-2 text-sm"
            disabled={status === "laden"}
          />
          <button
            type="submit"
            disabled={status === "laden" || !vraag.trim()}
            className="rounded-md bg-blauw px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Verstuur
          </button>
        </form>
      </main>
    </div>
  );
}
