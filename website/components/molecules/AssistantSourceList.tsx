interface AssistantBron {
  label: string;
  title: string;
  chapterTitle?: string | null;
  similarity: number;
  url: string;
}

// Klikbare bronnenlijst onder een AI-assistent-antwoord — zie
// lib/assistant/build-context.ts voor hoe label/url/similarity bepaald
// worden. Interne links (knowledge-sources/knowledge-drafts) openen in het
// beheerscherm; artikellinks openen de echte publieke pagina.
export default function AssistantSourceList({ bronnen }: { bronnen: AssistantBron[] }) {
  if (bronnen.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-grijs-200 bg-grijs-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-grijs-500">Bronnen</p>
      <ul className="flex flex-col gap-1.5">
        {bronnen.map((bron, i) => (
          <li key={`${bron.url}-${i}`}>
            <a
              href={bron.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 text-sm text-grijs-900 hover:underline"
            >
              <span aria-hidden="true">✓</span>
              <span>
                {bron.label} — {bron.title}
                {bron.chapterTitle ? ` (${bron.chapterTitle})` : ""}{" "}
                <span className="text-grijs-500">({Math.round(bron.similarity * 100)}% overeenkomst)</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
