import SourceCard, { type SourceCardProps } from "@/components/molecules/SourceCard";

interface AnswerSourcesProps {
  bronnen: SourceCardProps[];
}

// Zie docs/AI-KNOWLEDGE-STRATEGY.md §Bronvermelding — altijd zichtbaar bij een
// antwoord, nooit ingeklapt of optioneel.
export default function AnswerSources({ bronnen }: AnswerSourcesProps) {
  return (
    <div>
      <p className="text-xs font-medium tracking-[0.04em] text-grijs-600 uppercase">Bronnen</p>
      <div className="mt-2 flex flex-col gap-2">
        {bronnen.map((bron) => (
          <SourceCard key={bron.titel} {...bron} />
        ))}
      </div>
    </div>
  );
}
