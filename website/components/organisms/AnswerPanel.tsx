import Link from "@/components/atoms/Link";
import type { SourceCardProps } from "@/components/molecules/SourceCard";
import AnswerSources from "@/components/organisms/AnswerSources";
import FeedbackControl from "@/components/molecules/FeedbackControl";

export interface AnswerPanelProps {
  tekst: string;
  bronnen: SourceCardProps[];
  /** Bij een ambigue vraag: "Bedoelde je ook…"-links. Geen los "MultipleAnswers"-component — zie IMPLEMENTATION-PLAN.md. */
  suggesties?: string[];
}

// Eén samenhangend antwoord, met één of meerdere bronnen — zie
// docs/HOMEPAGE-SPEC.md §Gebruiker krijgt meerdere antwoorden. Nooit een
// lijst losse "resultaten".
export default function AnswerPanel({ tekst, bronnen, suggesties }: AnswerPanelProps) {
  return (
    <div className="mt-6 max-w-[560px] animate-[fade-in_200ms_ease-out] rounded-xl bg-white p-6 shadow-lg sm:p-8">
      <p className="text-lg leading-7 text-grijs-900">{tekst}</p>

      <div className="mt-6">
        <AnswerSources bronnen={bronnen} />
      </div>

      {suggesties && suggesties.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-grijs-600">Bedoelde je misschien ook…</p>
          <div className="mt-1 flex flex-col gap-1">
            {suggesties.map((suggestie) => (
              <Link
                key={suggestie}
                href={`/zoeken?q=${encodeURIComponent(suggestie)}`}
                className="w-fit text-sm"
              >
                {suggestie}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <FeedbackControl />
      </div>
    </div>
  );
}
