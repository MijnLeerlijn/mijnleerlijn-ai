"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button, TextInput } from "@payloadcms/ui";

interface SearchHit {
  type: "knowledge-source" | "knowledge-source-chapter" | "knowledge-draft" | "article";
  id: number;
  title: string;
  chapterTitle?: string;
  similarity: number;
  reason: string;
}

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  "knowledge-source": "Kennisbron",
  "knowledge-source-chapter": "Kennisbron (hoofdstuk)",
  "knowledge-draft": "Conceptkennisartikel",
  article: "Artikel",
};

type Status = "stil" | "bezig" | "klaar" | "fout";

// Eenvoudige testpagina voor semantisch zoeken — zie payload/globals/
// KnowledgeSearch.ts en app/api/knowledge/search/route.ts. Geen chatbot:
// toont uitsluitend de gerangschikte treffers met similarity-score, type,
// titel, reden en (indien van toepassing) hoofdstuk — geen gegenereerd
// antwoord.
export function SemanticSearchTester() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("stil");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [foutmelding, setFoutmelding] = useState("");

  async function zoek(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setStatus("bezig");
    setFoutmelding("");
    try {
      const response = await fetch("/api/knowledge/search", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await response.json()) as { hits: SearchHit[] } | { error: string };
      if (!response.ok || "error" in data) {
        setFoutmelding("error" in data ? data.error : "Zoeken mislukt.");
        setStatus("fout");
        return;
      }
      setHits(data.hits);
      setStatus("klaar");
    } catch {
      setFoutmelding("Zoeken mislukt door een netwerk- of serverfout.");
      setStatus("fout");
    }
  }

  return (
    <div>
      <form
        onSubmit={zoek}
        style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "1rem" }}
      >
        <div style={{ flex: 1 }}>
          <TextInput
            path="zoekvraag"
            label="Zoekvraag"
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={status === "bezig" || !query.trim()} buttonStyle="primary">
          {status === "bezig" ? "Bezig met zoeken…" : "Zoek semantisch"}
        </Button>
      </form>

      {status === "fout" && <p style={{ color: "var(--theme-error-500)" }}>{foutmelding}</p>}

      {status === "klaar" && hits.length === 0 && <p>Geen treffers gevonden.</p>}

      {status === "klaar" && hits.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {hits.map((hit, i) => (
            <li
              key={`${hit.type}-${hit.id}-${hit.chapterTitle ?? ""}-${i}`}
              style={{
                border: "1px solid var(--theme-elevation-150)",
                borderRadius: "4px",
                padding: "0.75rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                <span>
                  {hit.title}
                  {hit.chapterTitle ? ` — ${hit.chapterTitle}` : ""}
                </span>
                <span>{Math.round(hit.similarity * 100)}%</span>
              </div>
              <div style={{ fontSize: "0.85em", color: "var(--theme-elevation-500)" }}>
                {TYPE_LABEL[hit.type]}
              </div>
              <div style={{ marginTop: "0.25rem" }}>{hit.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
