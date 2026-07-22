"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import IconButton from "@/components/atoms/IconButton";

export interface FeedbackContext {
  vraag: string;
  antwoordTekst: string;
  bronArtikelSlugs: string[];
  pageUrl?: string;
}

interface FeedbackControlProps {
  /** Context van het beoordeelde antwoord/artikel — aanwezig, dan wordt de
   * keuze echt opgeslagen via app/api/feedback/route.ts. */
  context?: FeedbackContext;
  /** Extra hook, vooral handig in tests — wordt naast de echte opslag aangeroepen. */
  onFeedback?: (type: "nuttig" | "niet-nuttig") => void;
}

const RATING_MAP = { nuttig: "nuttig", "niet-nuttig": "niet_nuttig" } as const;

// Duim-omhoog/omlaag bij een antwoord of artikel — zie docs/UX-DESIGN.md
// §Componentenbibliotheek §Feedback & status. Verstuurt de keuze naar
// app/api/feedback/route.ts (echte opslag in Payload) zodra `context` is
// meegegeven; zonder context blijft het lokale UI-state (bv. in tests).
export default function FeedbackControl({ context, onFeedback }: FeedbackControlProps) {
  const [gekozen, setGekozen] = useState<"nuttig" | "niet-nuttig" | null>(null);

  const kies = (type: "nuttig" | "niet-nuttig") => {
    setGekozen(type);
    onFeedback?.(type);
    if (!context) return;
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vraag: context.vraag,
        antwoordTekst: context.antwoordTekst,
        bronArtikelSlugs: context.bronArtikelSlugs,
        pageUrl: context.pageUrl,
        rating: RATING_MAP[type],
      }),
    }).catch(() => {
      // Stil falen: de gebruiker heeft al "Bedankt voor je feedback" gezien —
      // een mislukte achtergrondverzending mag dat niet ongedaan maken.
    });
  };

  if (gekozen) {
    return <p className="text-sm text-grijs-600">Bedankt voor je feedback.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <IconButton
        icon={ThumbsUp}
        aria-label="Nuttig"
        onClick={() => kies("nuttig")}
        className="text-grijs-400 hover:text-blauw"
      />
      <IconButton
        icon={ThumbsDown}
        aria-label="Niet nuttig"
        onClick={() => kies("niet-nuttig")}
        className="text-grijs-400 hover:text-rood"
      />
    </div>
  );
}
