"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Button, TextInput } from "@payloadcms/ui";

// Chatbot-evaluatieomgeving — zie payload/globals/AssistantEval.ts en
// app/api/assistant/eval/run/route.ts (lib/assistant/evaluate.ts voor de
// pijplijn zelf). Toont ALLE diagnostiek van één evaluatierun (herschreven
// zoekvraag, gevonden bronnen/chunks met similarity/prioriteit/bronrol, de
// volledige contexttekst, antwoord, bronvermeldingen, confidence/no-answer)
// en laat een beheerder de uitkomst handmatig beoordelen (correct/
// gedeeltelijk correct/incorrect + vrije opmerkingen). GEEN automatische
// beoordeling — zie het commentaar in payload/collections/AssistantEvalRuns.ts.
//
// Beoordeling opslaan gaat rechtstreeks via Payload's eigen REST-API
// (PATCH /api/assistant-eval-runs/:id) — geen aparte routecode nodig, zelfde
// sessiecookie als de rest van de admin-UI.

interface EvalQuestion {
  id: number;
  question: string;
  category: string;
  notes?: string;
}

interface EvalHit {
  type: string;
  refId: number;
  title: string;
  chapterTitle?: string;
  similarity: number;
  priority?: string;
  bronrol?: string;
}

interface EvalSource {
  label: string;
  refCollection: string;
  refId: number;
  title: string;
  chapterTitle?: string;
  similarity: number;
  url: string;
}

interface EvalRunResultaat {
  runId: number;
  type: "answered" | "no-answer";
  question: string;
  rewrittenQuery: string;
  retrievalFase: string;
  hits: EvalHit[];
  contextText: string;
  hasAnswer: boolean;
  answer: string;
  reasoning: string;
  confidence: number;
  sources: EvalSource[];
  model: string;
}

interface RecentRun {
  id: number;
  question: string;
  hasAnswer: boolean;
  confidence: number;
  verdict: string;
  createdAt: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  feitelijk: "Feitelijke vraag",
  stap_voor_stap: "Stap-voor-stapvraag",
  meerdere_routes: "Vraag met meerdere routes",
  onduidelijk: "Onduidelijke vraag",
  onvoldoende_bron: "Vraag zonder voldoende bron",
};

const VERDICT_LABEL: Record<string, string> = {
  nog_niet_beoordeeld: "Nog niet beoordeeld",
  correct: "Correct",
  gedeeltelijk_correct: "Gedeeltelijk correct",
  incorrect: "Incorrect",
};

const kaartStijl: React.CSSProperties = {
  border: "1px solid var(--theme-elevation-150)",
  borderRadius: "4px",
  padding: "0.75rem 1rem",
  marginTop: "0.75rem",
};

async function veiligJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function AssistantEvalTester() {
  const [questions, setQuestions] = useState<EvalQuestion[]>([]);
  const [questionsFout, setQuestionsFout] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("");
  const [adHocQuestion, setAdHocQuestion] = useState("");
  const [status, setStatus] = useState<"stil" | "bezig" | "klaar" | "fout">("stil");
  const [foutmelding, setFoutmelding] = useState("");
  const [result, setResult] = useState<EvalRunResultaat | null>(null);

  const [verdict, setVerdict] = useState("nog_niet_beoordeeld");
  const [opmerkingen, setOpmerkingen] = useState("");
  const [saveStatus, setSaveStatus] = useState<"stil" | "bezig" | "opgeslagen" | "fout">("stil");

  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);

  async function laadVragen() {
    try {
      const response = await fetch("/api/assistant-eval-questions?limit=100&sort=category", {
        credentials: "include",
      });
      const data = (await veiligJson(response)) as { docs?: EvalQuestion[] } | null;
      if (!response.ok || !data?.docs) {
        setQuestionsFout("Kon de testvragenset niet laden.");
        return;
      }
      setQuestions(data.docs);
    } catch {
      setQuestionsFout("Kon de testvragenset niet laden (netwerkfout).");
    }
  }

  async function laadRecenteRuns() {
    try {
      const response = await fetch("/api/assistant-eval-runs?limit=20&sort=-createdAt&depth=0", {
        credentials: "include",
      });
      const data = (await veiligJson(response)) as { docs?: RecentRun[] } | null;
      if (response.ok && data?.docs) setRecentRuns(data.docs);
    } catch {
      // Stil falen — dit is alleen het overzichtslijstje, geen kernfunctie.
    }
  }

  useEffect(() => {
    laadVragen();
    laadRecenteRuns();
  }, []);

  async function draaiTest(event: FormEvent) {
    event.preventDefault();
    const vraagId = selectedQuestionId ? Number(selectedQuestionId) : undefined;
    if (!vraagId && !adHocQuestion.trim()) return;

    setStatus("bezig");
    setFoutmelding("");
    setResult(null);
    setVerdict("nog_niet_beoordeeld");
    setOpmerkingen("");
    setSaveStatus("stil");

    try {
      const response = await fetch("/api/assistant/eval/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vraagId ? { questionId: vraagId } : { question: adHocQuestion.trim() }),
      });
      const data = (await veiligJson(response)) as EvalRunResultaat | { error: string } | null;
      if (!response.ok || !data || "error" in data) {
        setFoutmelding(data && "error" in data ? data.error : "Evaluatie mislukt.");
        setStatus("fout");
        return;
      }
      setResult(data);
      setStatus("klaar");
      laadRecenteRuns();
    } catch {
      setFoutmelding("Evaluatie mislukt door een netwerk- of serverfout.");
      setStatus("fout");
    }
  }

  async function slaBeoordelingOp() {
    if (!result) return;
    setSaveStatus("bezig");
    try {
      const response = await fetch(`/api/assistant-eval-runs/${result.runId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, opmerkingen }),
      });
      if (!response.ok) {
        setSaveStatus("fout");
        return;
      }
      setSaveStatus("opgeslagen");
      laadRecenteRuns();
    } catch {
      setSaveStatus("fout");
    }
  }

  const kanDraaien = (!!selectedQuestionId || !!adHocQuestion.trim()) && status !== "bezig";

  return (
    <div>
      <form onSubmit={draaiTest} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div>
          <label htmlFor="eval-vraag-select" style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>
            Testvraag uit de vragenset ({questions.length})
          </label>
          <select
            id="eval-vraag-select"
            value={selectedQuestionId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              setSelectedQuestionId(e.target.value);
              if (e.target.value) setAdHocQuestion("");
            }}
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid var(--theme-elevation-150)",
              borderRadius: "4px",
              background: "var(--theme-input-bg)",
              color: "var(--theme-text)",
            }}
          >
            <option value="">— Kies een testvraag —</option>
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                [{CATEGORY_LABEL[q.category] ?? q.category}] {q.question}
              </option>
            ))}
          </select>
          {questionsFout && <p style={{ color: "var(--theme-error-500)" }}>{questionsFout}</p>}
        </div>

        <div>
          <TextInput
            path="adHocVraag"
            label="Of typ een eigen (losse) testvraag"
            value={adHocQuestion}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setAdHocQuestion(e.target.value);
              if (e.target.value) setSelectedQuestionId("");
            }}
          />
        </div>

        <div>
          <Button type="submit" disabled={!kanDraaien} buttonStyle="primary">
            {status === "bezig" ? "Bezig met evalueren…" : "Draai test"}
          </Button>
        </div>
      </form>

      {status === "fout" && <p style={{ color: "var(--theme-error-500)", marginTop: "0.75rem" }}>{foutmelding}</p>}

      {result && (
        <div style={kaartStijl}>
          <h4 style={{ marginTop: 0 }}>Resultaat</h4>

          <p>
            <strong>Originele vraag:</strong> {result.question}
          </p>
          <p>
            <strong>Herschreven zoekvraag:</strong> {result.rewrittenQuery}
          </p>
          <p>
            <strong>Retrievalfase:</strong> {result.retrievalFase}
          </p>
          <p>
            <strong>Beslissing:</strong>{" "}
            {result.hasAnswer ? "Antwoord gegeven" : "Geen antwoord (onvoldoende bron)"} — confidence{" "}
            {result.confidence}%
          </p>

          <h5>Gevonden bronnen/chunks ({result.hits.length})</h5>
          {result.hits.length === 0 ? (
            <p>Geen treffers.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--theme-elevation-150)" }}>
                  <th>Titel</th>
                  <th>Type</th>
                  <th>Similarity</th>
                  <th>Prioriteit</th>
                  <th>Bronrol</th>
                </tr>
              </thead>
              <tbody>
                {result.hits.map((h, i) => (
                  <tr key={`${h.type}-${h.refId}-${h.chapterTitle ?? ""}-${i}`}>
                    <td>
                      {h.title}
                      {h.chapterTitle ? ` — ${h.chapterTitle}` : ""}
                    </td>
                    <td>{h.type}</td>
                    <td>{Math.round(h.similarity * 100)}%</td>
                    <td>{h.priority ?? "—"}</td>
                    <td>{h.bronrol ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h5>Uiteindelijke context naar het taalmodel</h5>
          <textarea
            readOnly
            value={result.contextText}
            rows={8}
            style={{
              width: "100%",
              fontFamily: "monospace",
              fontSize: "0.85em",
              border: "1px solid var(--theme-elevation-150)",
              borderRadius: "4px",
              padding: "0.5rem",
            }}
          />

          <h5>Antwoord</h5>
          <p style={{ whiteSpace: "pre-wrap" }}>{result.answer}</p>
          <p>
            <em>Reasoning: {result.reasoning}</em>
          </p>

          <h5>Bronvermeldingen ({result.sources.length})</h5>
          {result.sources.length === 0 ? (
            <p>Geen (geen antwoord gegeven).</p>
          ) : (
            <ul>
              {result.sources.map((s, i) => (
                <li key={`${s.refCollection}-${s.refId}-${i}`}>
                  {s.label} — {s.title}
                  {s.chapterTitle ? ` — ${s.chapterTitle}` : ""} ({Math.round(s.similarity * 100)}%)
                </li>
              ))}
            </ul>
          )}

          <h5>Beoordeling</h5>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "28rem" }}>
            <select
              value={verdict}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setVerdict(e.target.value)}
              style={{
                padding: "0.5rem",
                border: "1px solid var(--theme-elevation-150)",
                borderRadius: "4px",
                background: "var(--theme-input-bg)",
                color: "var(--theme-text)",
              }}
            >
              {Object.entries(VERDICT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Opmerkingen: wat klopte niet, wat ontbrak, waarom deze beoordeling…"
              value={opmerkingen}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setOpmerkingen(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                border: "1px solid var(--theme-elevation-150)",
                borderRadius: "4px",
                padding: "0.5rem",
              }}
            />
            <div>
              <Button type="button" buttonStyle="secondary" onClick={slaBeoordelingOp} disabled={saveStatus === "bezig"}>
                {saveStatus === "bezig" ? "Opslaan…" : "Beoordeling opslaan"}
              </Button>
              {saveStatus === "opgeslagen" && <span style={{ marginLeft: "0.5rem" }}>Opgeslagen.</span>}
              {saveStatus === "fout" && (
                <span style={{ marginLeft: "0.5rem", color: "var(--theme-error-500)" }}>Opslaan mislukt.</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <h4>Recente runs ({recentRuns.length})</h4>
        {recentRuns.length === 0 ? (
          <p>Nog geen evaluatieruns.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--theme-elevation-150)" }}>
                <th>Vraag</th>
                <th>Antwoord?</th>
                <th>Confidence</th>
                <th>Beoordeling</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr key={r.id}>
                  <td>{r.question}</td>
                  <td>{r.hasAnswer ? "Ja" : "Nee"}</td>
                  <td>{r.confidence}%</td>
                  <td>{VERDICT_LABEL[r.verdict] ?? r.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
