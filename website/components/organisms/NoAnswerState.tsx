import { Info } from "lucide-react";
import NextLink from "next/link";
import { buttonStyles } from "@/components/atoms/Button";
import Chip from "@/components/atoms/Chip";

interface NoAnswerStateProps {
  gerelateerd?: string[];
  contactHref?: string;
}

// Visueel bewust anders dan AnswerPanel (gestippelde rand, grijze achtergrond,
// géén bronnenkaart) — zie docs/HOMEPAGE-SPEC.md §Gebruiker vindt niets en
// docs/UI-DESIGN.md §9. Eerlijke, warme toon i.p.v. een systeemfoutmelding.
// De CTA navigeert, dus is semantisch een link — rechtstreeks next/link met de
// gedeelde Button-styling (buttonStyles), bewust niet het Link-atom (dat heeft
// een eigen, hier ongewenste standaardkleur die zou botsen met de knopkleur).
export default function NoAnswerState({ gerelateerd, contactHref = "/contact" }: NoAnswerStateProps) {
  return (
    <div className="mt-6 max-w-[560px] animate-[fade-in_200ms_ease-out] rounded-xl border border-dashed border-grijs-200 bg-grijs-50 p-6 sm:p-8">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-grijs-100">
        <Info size={24} aria-hidden className="text-grijs-400" />
      </div>
      <p className="mt-3 text-base text-grijs-600">
        Dit weten we hier nog niet zeker genoeg om je een goed antwoord te geven.
      </p>
      <NextLink href={contactHref} className={`mt-4 ${buttonStyles("primary", "standaard")}`}>
        Stel je vraag via het contactformulier
      </NextLink>
      {gerelateerd && gerelateerd.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {gerelateerd.map((onderwerp) => (
            <Chip key={onderwerp}>{onderwerp}</Chip>
          ))}
        </div>
      )}
    </div>
  );
}
