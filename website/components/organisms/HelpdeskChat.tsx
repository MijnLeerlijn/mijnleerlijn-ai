"use client";

import { useState, type FormEvent } from "react";
import { ThumbsUp, ThumbsDown, FileText, ExternalLink, X } from "lucide-react";
import Image from "next/image";
import Button from "@/components/atoms/Button";
import Input from "@/components/atoms/Input";
import Spinner from "@/components/atoms/Spinner";
import ContactForm from "@/components/organisms/ContactForm";
import MarkdownAnswer from "@/components/molecules/MarkdownAnswer";
import { useVariant } from "@/providers/VariantProvider";

interface PublicManual {
  id: number;
  title: string;
  hasFile: boolean;
}

interface PublicStepImage {
  url: string;
  caption?: string;
  alt: string;
}

// Handleidingbouwer: de stap-citaten die direct onder een antwoord getoond
// worden — "toon alleen de stappen die echt relevant zijn, niet standaard de
// hele handleiding". Zelfde vorm als lib/assistant/process-public-question.ts's
// PublicStep (lokaal herhaald, zelfde patroon als PublicManual hierboven —
// geen gedeeld import tussen server- en clientcode in dit bestand).
interface PublicStep {
  handleidingId: number;
  handleidingSlug: string;
  handleidingTitel: string;
  handleidingUrl: string;
  stepId: string;
  stepNummer: number;
  titel: string;
  uitleg: string;
  images: PublicStepImage[];
}

interface Antwoord {
  // AI Verbetercentrum (2026-07-27): kan `null` zijn als het loggen van het
  // gesprek zelf mislukte (non-blocking — zie process-public-question.ts).
  // Zonder conversationId is er geen record om feedback aan te koppelen,
  // dus verbergt de UI dan de 👍/👎-knoppen.
  conversationId: number | null;
  hasAnswer: boolean;
  answer: string;
  manuals: PublicManual[];
  steps: PublicStep[];
}

interface Bericht {
  id: string;
  vraag: string;
  status: "laden" | "klaar" | "fout" | "verduidelijking";
  antwoord?: Antwoord;
  // Kennisbasis MijnLeerlijn — fase 1 (2026-07-27): tussenvraag van de AI
  // omdat de gestelde vraag tussen 2+ MijnLeerlijn-functies ambigu was. Geen
  // "geen antwoord" — dus bewust geen stappen/manuals-blok en geen
  // contactformulier-auto-trigger, zie ook de toelichting bij
  // pendingClarification hieronder.
  verduidelijkingsvraag?: string;
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
interface HelpdeskChatProps {
  /** Klikbare voorbeeldvragen onder het invoerveld (CMS-beheerd, zie payload/globals/HelpdeskVoorbeeldvragen.ts) — leeg = niets tonen. */
  voorbeeldvragen?: string[];
}

export default function HelpdeskChat({ voorbeeldvragen = [] }: HelpdeskChatProps) {
  const variant = useVariant();
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [vraag, setVraag] = useState("");
  const [vergroteAfbeelding, setVergroteAfbeelding] = useState<PublicStepImage | null>(null);
  // Kennisbasis MijnLeerlijn — fase 1 (2026-07-27): onthoudt de vraag die tot
  // een verduidelijkingsvraag leidde, zodat die als previousQuestion meegaat
  // bij de eerstvolgende vraag (zie process-public-question.ts). Wordt altijd
  // na precies één gebruik geleegd — bewust geen herhaalde verduidelijking:
  // de server kiest bij een nog steeds onduidelijk vervolg zelf de beste
  // kandidaat i.p.v. nogmaals te vragen.
  const [pendingClarification, setPendingClarification] = useState<string | null>(null);
  const bezig = berichten.some((b) => b.status === "laden");

  function samengesteldeUitleg(bericht: Bericht): string {
    const delen = [`Oorspronkelijke vraag:\n${bericht.vraag}`];
    if (bericht.antwoord?.answer) {
      delen.push(`Antwoord van de assistent:\n${bericht.antwoord.answer}`);
    }
    if (bericht.antwoord?.steps.length) {
      delen.push(
        `Getoonde stappen:\n${bericht.antwoord.steps.map((s) => `- ${s.handleidingTitel} — stap ${s.stepNummer}: ${s.titel}`).join("\n")}`
      );
    }
    if (bericht.antwoord?.manuals.length) {
      delen.push(`Gebruikte bronnen:\n${bericht.antwoord.manuals.map((m) => `- ${m.title}`).join("\n")}`);
    }
    return delen.join("\n\n");
  }

  // Losgetrokken van het formulier-submit-event zodat zowel het echte
  // invoerveld als een klik op een voorbeeldvraag dezelfde flow gebruiken —
  // inclusief de bestaande, meteen-zichtbare feedback (vraagbubbel + spinner
  // verschijnen synchroon, vóór de fetch), zodat "direct versturen" bij een
  // voorbeeldvraag hetzelfde voelt als zelf typen en op Verstuur klikken.
  async function stelVraag(tekst: string) {
    const schoon = tekst.trim();
    if (!schoon || bezig) return;

    const previousQuestion = pendingClarification;
    setPendingClarification(null);

    const id = crypto.randomUUID();
    setBerichten((huidig) => [...huidig, { id, vraag: schoon, status: "laden", toonContact: false }]);

    try {
      const res = await fetch("/api/helpdesk/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previousQuestion ? { question: schoon, previousQuestion } : { question: schoon }),
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

      if (data.type === "clarification") {
        setPendingClarification(schoon);
        setBerichten((huidig) =>
          huidig.map((b) =>
            b.id === id ? { ...b, status: "verduidelijking", verduidelijkingsvraag: data.question } : b
          )
        );
        return;
      }

      setBerichten((huidig) =>
        huidig.map((b) =>
          b.id === id ? { ...b, status: "klaar", antwoord: data, toonContact: !data.hasAnswer } : b
        )
      );
    } catch {
      setBerichten((huidig) =>
        huidig.map((b) =>
          b.id === id
            ? {
                ...b,
                status: "fout",
                foutmelding: "De assistent is nu niet bereikbaar door een netwerkfout.",
              }
            : b
        )
      );
    }
  }

  async function verstuurVraag(event: FormEvent) {
    event.preventDefault();
    const tekst = vraag;
    setVraag("");
    await stelVraag(tekst);
  }

  // Homepage-herontwerp (2026-07-29): vult voortaan alleen het invoerveld
  // i.p.v. de vraag direct te versturen — de bezoeker kan de voorgestelde
  // vraag nog aanpassen, en de telling voor "Meest gestelde vragen"
  // (app/api/helpdesk/ask/route.ts → lib/helpdesk/registreer-gestelde-vraag.ts)
  // gaat pas omhoog bij een echte, bevestigde "Verstuur"-klik.
  function klikVoorbeeldvraag(tekst: string) {
    setVraag(tekst);
  }

  async function geefFeedback(bericht: Bericht, rating: "nuttig" | "niet_nuttig") {
    if (!bericht.antwoord || bericht.antwoord.conversationId === null || bericht.feedback) return;
    setBerichten((huidig) =>
      huidig.map((b) =>
        b.id === bericht.id
          ? { ...b, feedback: rating, toonContact: rating === "niet_nuttig" || b.toonContact }
          : b
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
          <div className="rounded-xl border border-dashed border-grijs-200 bg-grijs-50 p-6">
            <p className="text-sm font-semibold text-grijs-900">{variant.websiteTeksten.helpdeskIntro}</p>
            <p className="mt-2 text-sm leading-6 text-grijs-600">
              Beschrijf zo concreet mogelijk:
            </p>
            <ul className="mt-1 list-inside list-disc text-sm leading-6 text-grijs-600">
              <li>waar je bent in {variant.branding.productName};</li>
              <li>wat je probeert te doen;</li>
              <li>wat er gebeurt;</li>
              <li>wat je had verwacht.</li>
            </ul>
            <p className="mt-2 text-sm leading-6 text-grijs-600">
              Zo kan de assistent je veel gerichter helpen.
            </p>

            <div className="mt-4 flex flex-col gap-2 border-t border-grijs-200 pt-4 text-sm">
              <p className="flex items-start gap-2 text-grijs-500">
                <span aria-hidden>❌</span>
                <span>Niet: &ldquo;Ik zie een leerling niet.&rdquo;</span>
              </p>
              <p className="flex items-start gap-2 text-grijs-900">
                <span aria-hidden>✅</span>
                <span>
                  Wel: &ldquo;Als ik naar het Leerdoelenoverzicht ga, mis ik één leerling. De
                  leerling staat wel in mijn groep, maar verschijnt niet in het overzicht.&rdquo;
                </span>
              </p>
            </div>
          </div>
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

            {bericht.status === "verduidelijking" && (
              <div className="max-w-[85%] rounded-xl border border-grijs-200 border-t-2 border-t-[var(--variant-accent)] bg-white p-5 text-sm text-grijs-900 shadow-sm sm:max-w-[70%]">
                {bericht.verduidelijkingsvraag}
              </div>
            )}

            {bericht.status === "klaar" && bericht.antwoord && (
              <div className="max-w-[85%] rounded-xl border border-grijs-200 border-t-2 border-t-[var(--variant-accent)] bg-white p-5 shadow-sm sm:max-w-[70%]">
                <MarkdownAnswer tekst={bericht.antwoord.answer} />

                {bericht.antwoord.steps.length > 0 && (
                  <div className="mt-4 flex flex-col gap-4 border-t border-grijs-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-grijs-500">
                      Relevante stap{bericht.antwoord.steps.length > 1 ? "pen" : ""} uit de handleiding
                    </p>
                    {bericht.antwoord.steps.map((stap) => (
                      <div key={`${stap.handleidingId}-${stap.stepId}`} className="flex flex-col gap-2">
                        <p className="text-sm font-semibold text-grijs-900">
                          Stap {stap.stepNummer} — {stap.titel}
                        </p>
                        <p className="text-sm leading-6 text-grijs-700">{stap.uitleg}</p>
                        {stap.images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {stap.images.map((afbeelding, i) => (
                              <button
                                key={`${afbeelding.url}-${i}`}
                                type="button"
                                onClick={() => setVergroteAfbeelding(afbeelding)}
                                className="group flex flex-col overflow-hidden rounded-lg border border-grijs-200"
                              >
                                <Image
                                  src={afbeelding.url}
                                  alt={afbeelding.alt}
                                  width={320}
                                  height={200}
                                  className="h-auto w-full max-w-[280px] object-cover transition-opacity duration-[120ms] group-hover:opacity-80"
                                />
                                {afbeelding.caption && (
                                  <span className="bg-grijs-50 px-2 py-1 text-left text-xs text-grijs-600">
                                    {afbeelding.caption}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {[...new Map(bericht.antwoord.steps.map((s) => [s.handleidingUrl, s])).values()].map(
                      (s) => (
                        <a
                          key={s.handleidingUrl}
                          href={s.handleidingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 self-start text-sm text-[var(--variant-accent)] hover:underline"
                        >
                          <ExternalLink size={14} aria-hidden />
                          Bekijk de volledige handleiding &ldquo;{s.handleidingTitel}&rdquo;
                        </a>
                      )
                    )}
                  </div>
                )}

                {bericht.antwoord.manuals.length > 0 && (
                  <div className="mt-4 border-t border-grijs-100 pt-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-grijs-500">
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
                            <a
                              href={`/api/knowledge/download/${manual.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex shrink-0 items-center gap-1 text-[var(--variant-accent)] hover:underline"
                            >
                              <ExternalLink size={14} aria-hidden />
                              Openen
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {bericht.antwoord.conversationId !== null && (
                  <div className="mt-4 flex items-center gap-4 border-t border-grijs-100 pt-4">
                    <button
                      type="button"
                      disabled={Boolean(bericht.feedback)}
                      onClick={() => geefFeedback(bericht, "nuttig")}
                      className={`flex items-center gap-1.5 text-sm transition-colors duration-[120ms] ${
                        bericht.feedback === "nuttig"
                          ? "font-medium text-groen"
                          : bericht.feedback
                            ? "text-grijs-300"
                            : "text-grijs-500 hover:text-groen"
                      }`}
                    >
                      <ThumbsUp size={16} aria-hidden />
                      Dit antwoord hielp mij
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(bericht.feedback)}
                      onClick={() => geefFeedback(bericht, "niet_nuttig")}
                      className={`flex items-center gap-1.5 text-sm transition-colors duration-[120ms] ${
                        bericht.feedback === "niet_nuttig"
                          ? "font-medium text-rood"
                          : bericht.feedback
                            ? "text-grijs-300"
                            : "text-grijs-500 hover:text-rood"
                      }`}
                    >
                      <ThumbsDown size={16} aria-hidden />
                      Dit antwoord hielp mij niet
                    </button>
                    {bericht.feedback && (
                      <span className="text-sm text-grijs-500">
                        {bericht.feedback === "nuttig"
                          ? "Bedankt voor je feedback!"
                          : "Bedankt, we kijken ernaar."}
                      </span>
                    )}
                  </div>
                )}

                {!bericht.antwoord.hasAnswer && (
                  <p className="mt-1 text-xs text-grijs-500">
                    Vul hieronder aan wat je precies wilt weten — een collega neemt persoonlijk contact met je
                    op.
                  </p>
                )}

                {bericht.toonContact && (
                  <div className="mt-5 border-t border-grijs-100 pt-5">
                    <ContactForm
                      initieelOnderwerp={bericht.vraag.slice(0, 120)}
                      initieleUitleg={samengesteldeUitleg(bericht)}
                      initieleUrl={typeof window !== "undefined" ? window.location.href : undefined}
                      conversationId={bericht.antwoord.conversationId}
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
          placeholder={variant.websiteTeksten.zoekveldPlaceholder}
          aria-label="Typ je vraag"
          disabled={bezig}
          className="h-12"
        />
        <Button type="submit" size="groot" disabled={bezig || !vraag.trim()}>
          Verstuur
        </Button>
      </form>

      {voorbeeldvragen.length > 0 && berichten.length === 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-grijs-500">
            Meest gestelde vragen
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {voorbeeldvragen.map((tekst) => (
              <button
                key={tekst}
                type="button"
                onClick={() => klikVoorbeeldvraag(tekst)}
                disabled={bezig}
                className="rounded-full border border-grijs-200 bg-white px-3 py-1.5 text-xs text-grijs-600 transition-colors duration-[120ms] hover:border-[var(--variant-accent)] hover:text-[var(--variant-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {tekst}
              </button>
            ))}
          </div>
        </div>
      )}

      {vergroteAfbeelding && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={vergroteAfbeelding.alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-donkerblauw/80 p-6"
          onClick={() => setVergroteAfbeelding(null)}
        >
          <button
            type="button"
            onClick={() => setVergroteAfbeelding(null)}
            aria-label="Sluiten"
            className="absolute right-6 top-6 text-white/80 hover:text-white"
          >
            <X size={28} aria-hidden />
          </button>
          <Image
            src={vergroteAfbeelding.url}
            alt={vergroteAfbeelding.alt}
            width={1200}
            height={800}
            className="max-h-[85vh] w-auto max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
