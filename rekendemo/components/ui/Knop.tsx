import type { ButtonHTMLAttributes } from "react";

type KnopProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primair" | "secundair";
};

export function Knop({ variant = "primair", className = "", ...props }: KnopProps) {
  const stijl =
    variant === "primair"
      ? "bg-accent text-white hover:bg-accent-hover"
      : "border border-line bg-white text-ink hover:border-accent/50";

  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${stijl} ${className}`}
      {...props}
    />
  );
}
