"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import IconButton from "@/components/atoms/IconButton";

// 👍/👎 op een AI-assistent-antwoord — zie payload/collections/
// AssistantConversations.ts en app/api/assistant/feedback/route.ts. Bij 👎
// vraagt dit component eerst "Wat miste er?" (vrije tekst) voordat de
// feedback wordt opgeslagen — zelfde patroon als
// components/molecules/FeedbackControl.tsx (de bestaande, publieke
// zoekantwoord-feedback), maar met de extra follow-upvraag zoals gevraagd.
export default function AssistantFeedback({ conversationId }: { conversationId: number }) {
  const [status, setStatus] = useState<"stil" | "vraagt-toelichting" | "opgeslagen">("stil");
  const [toelichting, setToelichting] = useState("");

  async function verstuurFeedback(rating: "nuttig" | "niet_nuttig", missing?: string) {
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, rating, missing }),
      });
    } catch {
      // Stil falen: de gebruiker heeft de bevestiging al gezien.
    }
    setStatus("opgeslagen");
  }

  if (status === "opgeslagen") {
    return <p className="text-sm text-grijs-500">Bedankt voor je feedback.</p>;
  }

  if (status === "vraagt-toelichting") {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={`toelichting-${conversationId}`} className="text-sm text-grijs-700">
          Wat miste er?
        </label>
        <textarea
          id={`toelichting-${conversationId}`}
          value={toelichting}
          onChange={(e) => setToelichting(e.target.value)}
          rows={2}
          className="rounded-md border border-grijs-200 p-2 text-sm"
          placeholder="Optioneel — help ons het antwoord te verbeteren"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => verstuurFeedback("niet_nuttig", toelichting.trim() || undefined)}
            className="rounded-md bg-blauw px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            Verzenden
          </button>
          <button
            type="button"
            onClick={() => verstuurFeedback("niet_nuttig")}
            className="rounded-md px-3 py-1.5 text-sm text-grijs-500 hover:underline"
          >
            Overslaan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <IconButton
        icon={ThumbsUp}
        aria-label="Nuttig"
        onClick={() => verstuurFeedback("nuttig")}
        className="text-grijs-400 hover:text-blauw"
      />
      <IconButton
        icon={ThumbsDown}
        aria-label="Niet nuttig"
        onClick={() => setStatus("vraagt-toelichting")}
        className="text-grijs-400 hover:text-rood"
      />
    </div>
  );
}
