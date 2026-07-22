import type { InputHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

// Basisveld — zie docs/UI-DESIGN.md §8. SearchInput (molecule) bouwt hierop
// voort voor het grote, dominante zoekveld met verzendknop.
export default function Input({ error = false, className, ...rest }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border bg-white px-3 text-base text-grijs-900 outline-none transition-colors duration-[120ms] placeholder:text-grijs-400",
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
