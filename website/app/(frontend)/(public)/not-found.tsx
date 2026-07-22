import { Search } from "lucide-react";
import NextLink from "next/link";
import { buttonStyles } from "@/components/atoms/Button";
import { categorieen } from "@/lib/data/categories";

// In-app 404 (bv. een onbekende artikel- of categorieslug) — mét Header/Footer,
// zodat de gebruiker nooit in een doodlopende route belandt. Zie
// docs/IMPLEMENTATION-PLAN.md Fase 3 §Navigatie: "geen doodlopende routes".
export default function PublicNotFound() {
  return (
    <div className="mx-auto flex max-w-[680px] flex-col items-center px-4 py-20 text-center sm:px-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-grijs-100">
        <Search size={24} aria-hidden className="text-grijs-400" />
      </div>
      <p className="mt-4 text-sm font-medium tracking-[0.04em] text-grijs-400 uppercase">
        Pagina niet gevonden
      </p>
      <h1 className="mt-2 text-h1 font-bold text-grijs-900">Deze pagina bestaat niet (meer)</h1>
      <p className="mt-3 max-w-md text-base text-grijs-600">
        Misschien is de link verouderd, of staat de handleiding onder een andere naam. Zoek opnieuw of bekijk
        een van de onderwerpen hieronder.
      </p>

      <NextLink href="/" className={`mt-6 ${buttonStyles("primary", "standaard")}`}>
        Terug naar de homepage
      </NextLink>

      <div className="mt-10 flex flex-wrap justify-center gap-2">
        {categorieen.slice(0, 6).map((c) => (
          <NextLink
            key={c.slug}
            href={`/categorie/${c.slug}`}
            className="rounded-full border border-grijs-300 bg-white px-4 py-2 text-sm text-grijs-900 transition-colors duration-[120ms] hover:border-[var(--variant-accent)] hover:text-[var(--variant-accent)]"
          >
            {c.titel}
          </NextLink>
        ))}
      </div>
    </div>
  );
}
