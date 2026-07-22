import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

// Zie docs/UI-DESIGN.md §8. Minimale hoogte 96px, groeit mee met inhoud
// (rows door de aanroeper te bepalen).
export default function Textarea({ error = false, className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "min-h-24 w-full rounded-md border bg-white px-3 py-2 text-base text-grijs-900 outline-none transition-colors duration-[120ms] placeholder:text-grijs-400",
        "disabled:cursor-not-allowed disabled:bg-grijs-100 disabled:text-grijs-400",
        error
          ? "border-rood focus:border-2 focus:border-rood"
          : "border-grijs-200 focus:border-2 focus:border-[var(--variant-accent)]",
        className
      )}
      aria-invalid={error || undefined}
      {...rest}
    />
  );
}
