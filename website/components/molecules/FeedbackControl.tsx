"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import IconButton from "@/components/atoms/IconButton";

interface FeedbackControlProps {
  onFeedback?: (type: "nuttig" | "niet-nuttig") => void;
}

// Duim-omhoog/omlaag bij een antwoord — zie docs/UX-DESIGN.md
// §Componentenbibliotheek §Feedback & status. Lokale state (geen echte
// verzending in Fase 2, zie IMPLEMENTATION-PLAN.md).
export default function FeedbackControl({ onFeedback }: FeedbackControlProps) {
  const [gekozen, setGekozen] = useState<"nuttig" | "niet-nuttig" | null>(null);

  const kies = (type: "nuttig" | "niet-nuttig") => {
    setGekozen(type);
    onFeedback?.(type);
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
