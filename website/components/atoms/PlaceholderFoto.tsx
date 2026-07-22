import { ImageOff } from "lucide-react";

interface PlaceholderFotoProps {
  label: string;
  className?: string;
}

// Brand/images/ is leeg (zie docs/DESIGN-SYSTEM.md §Ontbreekt) — dit is een
// bewust gemarkeerde placeholder, geen verzonnen fotografie.
export default function PlaceholderFoto({ label, className = "" }: PlaceholderFotoProps) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-grijs-200 to-grijs-300 ${className}`}
    >
      <div className="flex flex-col items-center gap-2 text-grijs-600 px-4 text-center">
        <ImageOff size={28} strokeWidth={1.5} />
        <span className="text-xs font-medium">{label} — placeholder</span>
      </div>
    </div>
  );
}
