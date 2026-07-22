"use client";

import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { focusRingOnDark } from "@/utils/focus-ring";

export interface SearchInputProps {
  id?: string;
  defaultValue?: string;
  placeholder: string;
  readOnly?: boolean;
  loading?: boolean;
  onSubmit?: (waarde: string) => void;
}

// Het dominante zoekveld uit de Hero — zie docs/HOMEPAGE-VISUAL-SPEC.md §2.
// Bewust géén los "zoekveld in de header": er is precies één zoekveld,
// zie docs/HOMEPAGE-SPEC.md.
export default function SearchInput({
  id = "zoekveld",
  defaultValue = "",
  placeholder,
  readOnly = false,
  loading = false,
  onSubmit,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [waarde, setWaarde] = useState(defaultValue);

  const versturen = () => {
    if (waarde.trim().length === 0) return;
    onSubmit?.(waarde);
  };

  return (
    <div
      className={cn(
        "flex h-16 items-center rounded-lg bg-white pl-5 pr-2",
        loading
          ? "border-2 border-white/60 animate-pulse"
          : "border border-white/30 focus-within:border-2 focus-within:border-blauw focus-within:shadow-[0_0_0_4px_rgba(21,136,201,0.15)]"
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        readOnly={readOnly}
        value={waarde}
        onChange={(event) => setWaarde(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") versturen();
        }}
        placeholder={placeholder}
        aria-label="Stel je vraag"
        className="h-full flex-1 bg-transparent text-base text-grijs-900 outline-none placeholder:text-grijs-400"
      />
      <button
        type="button"
        aria-label="Verstuur vraag"
        onClick={versturen}
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--variant-accent)] text-white transition-colors duration-[120ms] hover:brightness-90",
          focusRingOnDark
        )}
      >
        <ArrowRight size={20} aria-hidden />
      </button>
    </div>
  );
}
