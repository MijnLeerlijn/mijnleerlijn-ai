import { AlertTriangle } from "lucide-react";
import Button from "@/components/atoms/Button";

interface ErrorMessageProps {
  titel?: string;
  beschrijving: string;
  onRetry?: () => void;
}

// Foutbanner op paginaniveau — zie docs/UI-DESIGN.md §15. Bewust een ander
// icoon/rustiger toon dan NoAnswerState (organism): dit is een technische
// fout, geen "geen betrouwbaar antwoord"-situatie.
export default function ErrorMessage({
  titel = "Er ging iets mis",
  beschrijving,
  onRetry,
}: ErrorMessageProps) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-rood/20 bg-rood/5 p-4">
      <AlertTriangle size={20} aria-hidden className="mt-0.5 shrink-0 text-rood" />
      <div>
        <p className="text-sm font-semibold text-grijs-900">{titel}</p>
        <p className="mt-1 text-sm text-grijs-600">{beschrijving}</p>
        {onRetry && (
          <Button variant="secondary" size="compact" onClick={onRetry} className="mt-3">
            Probeer opnieuw
          </Button>
        )}
      </div>
    </div>
  );
}
