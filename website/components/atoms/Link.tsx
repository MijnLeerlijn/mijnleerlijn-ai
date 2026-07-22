import NextLink from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "@/utils/cn";
import { focusRing, focusRingOnDark } from "@/utils/focus-ring";

export interface LinkProps extends ComponentProps<typeof NextLink> {
  /** Standaard onderstreept (ondergeschikte link); "hover" toont de underline pas bij hover. */
  underline?: "always" | "hover";
  onDark?: boolean;
}

// Zie docs/UI-DESIGN.md §33/§34. Gebruikt de variant-accentkleur voor tekst,
// zodat een link altijd meekleurt met de actieve variant. forwardRef zodat
// consumenten (bv. MobileNavigation) er programmatisch focus naar toe kunnen
// verplaatsen.
const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { underline = "hover", onDark = false, className, ...rest },
  ref
) {
  return (
    <NextLink
      ref={ref}
      className={cn(
        "rounded-sm transition-colors duration-[120ms]",
        onDark
          ? `text-white/75 hover:text-white ${focusRingOnDark}`
          : `text-[var(--variant-accent)] hover:underline ${focusRing}`,
        underline === "always" && "underline",
        className
      )}
      {...rest}
    />
  );
});

export default Link;
