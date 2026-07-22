import { cn } from "@/utils/cn";

interface GradientAccentProps {
  className?: string;
}

// De MijnLeerlijn-signatuurlijn (blauw→groen→geel→oranje→rood), zie
// docs/DESIGN-SYSTEM.md §Merkbasis en docs/UI-DESIGN.md §38. Stond tot nu toe
// 4× hardcoded (Hero-tagline, sectiekoppen, Footer, UpdateCard) — één atom,
// nooit als achtergrond achter tekst (zie UI-DESIGN.md §38 "wanneer niet").
export default function GradientAccent({ className }: GradientAccentProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "block h-[3px] rounded-full bg-[linear-gradient(to_right,#1588c9,#53ac32,#fec905,#ec6608,#e10919)]",
        className
      )}
    />
  );
}
