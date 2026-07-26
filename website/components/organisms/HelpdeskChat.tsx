"use client";

import { useState, type FormEvent } from "react";
import { ThumbsUp, ThumbsDown, FileText, ExternalLink, Download } from "lucide-react";
import Button from "@/components/atoms/Button";
import Input from "@/components/atoms/Input";
import Spinner from "@/components/atoms/Spinner";
import ContactForm from "@/components/organisms/ContactForm";
import MarkdownAnswer from "@/components/molecules/MarkdownAnswer";

interface PublicManual {
  id: number;
  title: string;
  hasFile: boolean;
}

interface Antwoord {
  conversationId: number;
  hasAnswer: boolean;
  answer: string;
  manuals: PublicManual[];
}

interface Bericht {
  id: string;
  vraag: string;
  status: "laden" | "klaar" | "fout";
  antwoord?: Antwoord;
  foutmelding?: string;
  feedback?: "nuttig" | "niet_nuttig";
  toonContact: boolean;
}

// De hoofdervaring van de helpdesk-homepage (Helpdesk MVP 1.0) — een echt
// doorlopend, ChatGPT-achtig gesprek (in tegenstelling tot het interne
// /assistant-scherm, dat maar één vraag/antwoord tegelijk toont): elke
// nieuwe vraag wordt aan de thread TOEGEVOEGD, niet vervangen. Geen
// "Gesprekken"-zijbalk (geen ingelogde gebruiker om gesprekken van te
// bewaren/tonen) en geen confidence/reasoning zichtbaar voor de bezoeker —
// uitsluitend de drie afgesproken acties per antwoord: 👍/👎/📄.
//
// Bewust een eigen, kleine feedback-/contactformulier-implementatie i.p.v.
// hergebruik van components/molecules/AssistantFeedback.tsx: dat component
// hoort bij het interne scherm (eigen "Wat miste er?"-tekstprompt, ander
// eindpunt) — hier volstaan 👍/👎 zelf, en 👎 opent direct het
// contactformulier in plaats van een tussenstap.
export default function HelpdeskChat() {
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [vraag, setVraag] = useState("");
  const bezig = berichten.some((b) => b.status === "laden");

  function samengesteldeUitleg(bericht: Bericht): string {
    const delen = [`Oorspronkelijke vraag:\n${bericht.vraag}`];
    if (bericht.antwoord?.answer) {
      delen.push(`Antwoord van de assistent:\n${bericht.antwoord.answer}`);
    }
    if (bericht.antwoord?.manuals.length) {
      delen.push(`Gebruikte bronnen:\n${bericht.antwoord.manuals.map((m) => `- ${m.title}`).join("\n")}`);
    }
    return delen.join("\n\n");
  }

  async function verstuurVraag(event: FormEvent) {
    event.preventDefault();
    const tekst = vraag.trim();
    if (!tekst || bezig) return;

    const id = crypto.randomUUID();
    setBerichten((huidig) => [...huidig, { id, vraag: tekst, status: "laden", toonContact: false }]);
    setVraag("");

    try {
      const res = await fetch("/api/helpdesk/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: tekst }),
      });
      const data = await res.json();

      if (!res.ok || "error" in data) {
        setBerichten((huidig) =>
          huidig.map((b) =>
            b.id === id
              ? {
                  ...b,
                  status: "fout",
                  foutmelding:
                    "error" in data
                      ? data.error
                      : "De assistent is nu niet bereikbaar. Probeer het later opnieuw.",
                }
              : b
          )
        );
        return;
      }

      setBerichten((huidig) =>
        huidig.map((b) =>
          b.id === id
            ? { ...b, status: "klaar", antwoord: data, toonContact: !data.hasAnswer }
            : b
        )
      );
    } catch {
      setBerichten((huidig) =>
        huidig.map((b) =>
          b.id === id
            ? { ...b, status: "fout", foutmelding: "De assistent is nu niet bereikbaar door een netwerkfout." }
            : b
        )
      );
    }
  }

  async function geefFeedback(bericht: Bericht, rating: "nuttig" | "niet_nuttig") {
    if (!bericht.antwoord || bericht.feedback) return;
    setBerichten((huidig) =>
      huidig.map((b) =>
        b.id === bericht.id ? { ...b, feedback: rating, toonContact: rating === "niet_nuttig" || b.toonContact } : b
      )
    );
    try {
      await fetch("/api/helpdesk/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: bericht.antwoord.conversationId, rating }),
      });
    } catch {
      // Stil falen: de gebruiker heeft de gekozen knop al zien reageren.
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-6">
        {berichten.length === 0 && (
          <p className="rounded-xl border border-dashed border-grijs-200 bg-grijs-50 p-6 text-sm text-grijs-500">
            Stel hieronder je vraag. Bijvoorbeeld: &ldquo;Hoe maak ik een doelenset aan?&rdquo;
          </p>
        )}

        {berichten.map((bericht) => (
          <div key={bericht.id} className="flex flex-col gap-3">
            <div className="ml-auto max-w-[85%] rounded-xl bg-[var(--variant-accent)] px-4 py-2.5 text-sm text-white sm:max-w-[70%]">
              {bericht.vraag}
            </div>

            {bericht.status === "laden" && (
              <div className="flex items-center gap-2 text-sm text-grijs-500">
                <Spinner size={16} label="Bezig" />
                Even zoeken in de handleidingen...
              </div>
            )}

            {bericht.status === "fout" && (
              <div className="max-w-[85%] rounded-xl border border-rood/20 bg-rood/5 p-4 text-sm text-grijs-900 sm:max-w-[70%]">
                {bericht.foutmelding}
              </div>
            )}

            {bericht.status === "klaar" && bericht.antwoord && (
              <div className="max-w-[85%] rounded-xl border border-grijs-200 border-t-2 border-t-[var(--variant-accent)] bg-white p-5 shadow-sm sm:max-w-[70%]">
                <MarkdownAnswer tekst={bericht.antwoord.answer} />

                {bericht.antwoord.manuals.length > 0 && (
                  <div className="mt-4 border-t border-grijs-100 pt-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-grijs-600">
                      <FileText size={14} aria-hidden className="text-[var(--variant-accent)]" />
                      Bekijk handleiding{bericht.antwoord.manuals.length > 1 ? "en" : ""}
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {bericht.antwoord.manuals.map((manual) => (
                        <li
                          key={manual.id}
                          className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm transition-colors duration-[120ms] hover:bg-grijs-50 -mx-2"
                        >
                          <span className="text-grijs-900">{manual.title}</span>
                          {manual.hasFile && (
                            <span className="flex shrink-0 items-center gap-2">
                              <a
                                href={`/api/knowledge/download/${manual.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[var(--variant-accent)] hover:underline"
                              >
                                <ExternalLink size={14} aria-hidden />
                                Openen
                              </a>
                              <a
                                href={`/api/knowledge/download/${manual.id}`}
                                download
                                aria-label={`Download ${manual.title} als PDF`}
                                className="text-grijs-400 hover:text-[var(--variant-accent)]"
                              >
                                <Download size={14} aria-hidden />
                              </a>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-4 border-t border-grijs-100 pt-4">
                  <button
                    type="button"
                    disabled={Boolean(bericht.feedback)}
                    onClick={() => geefFeedback(bericht, "nuttig")}
                    className={`flex items-center gap-1.5 text-sm transition-colors duration-[120ms] ${
                      bericht.feedback === "nuttig"
                        ? "font-medium text-groen"
                        : "text-grijs-500 hover:text-groen disabled:hover:text-grijs-500"
                    }`}
                  >
                    <ThumbsUp size={16} aria-hidden />
                    Dit heeft mij geholpen
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(bericht.feedback)}
                    onClick={() => geefFeedback(bericht, "niet_nuttig")}
                    className={`flex items-center gap-1.5 text-sm transition-colors duration-[120ms] ${
                      bericht.feedback === "niet_nuttig"
                        ? "font-medium text-rood"
                        : "text-grijs-500 hover:text-rood disabled:hover:text-grijs-500"
                    }`}
                  >
                    <ThumbsDown size={16} aria-hidden />
                    Ik kom er niet uit
                  </button>
                </div>

                {!bericht.antwoord.hasAnswer && (
                  <p className="mt-1 text-xs text-grijs-500">
                    Vul hieronder aan wat je precies wilt weten — een collega neemt persoonlijk contact met je op.
                  </p>
                )}

                {bericht.toonContact && (
                  <div className="mt-5 border-t border-grijs-100 pt-5">
                    <ContactForm
                      initieelOnderwerp={bericht.vraag.slice(0, 120)}
                      initieleUitleg={samengesteldeUitleg(bericht)}
                      initieleUrl={typeof window !== "undefined" ? window.location.href : undefined}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={verstuurVraag} className="sticky bottom-0 mt-6 flex gap-2 bg-white pt-2">
        <Input
          type="text"
          value={vraag}
          onChange={(e) => setVraag(e.target.value)}
          placeholder="Typ je vraag..."
          aria-label="Typ je vraag"
          disabled={bezig}
          className="h-12"
        />
        <Button type="submit" size="groot" disabled={bezig || !vraag.trim()}>
          Verstuur
        </Button>
      </form>
    </div>
  );
}
