import type { Metadata } from "next";
import Image from "next/image";
import NextLink from "next/link";
import KnowledgeLayout from "@/components/layouts/KnowledgeLayout";
import Badge from "@/components/atoms/Badge";
import { getAllVariants } from "@/services/payload";
import { focusRing } from "@/utils/focus-ring";

export const metadata: Metadata = { title: "Kies je product — MijnLeerlijn" };

const ONDERWIJSTYPE_LABEL: Record<string, string> = {
  algemeen: "Voor elke onderwijsvorm",
  montessori: "Voor montessorionderwijs",
  dalton: "Voor daltononderwijs",
};

// Publieke variantkiezer — zie docs/UX-DESIGN.md scherm 9. Bij landing op een
// niet-herkende/algemene URL kiest een bezoeker hier voor welk product hij
// hulp zoekt. Gekoppeld aan Payload via services/payload.ts (Fase 4 Stap 7).
// Echte domein-/subdomeinroutering (middleware) blijft gereserveerd voor een
// latere fase — deze kaarten linken daarom nog naar de homepage.
export default async function KiesVariantPagina() {
  const varianten = await getAllVariants();

  return (
    <KnowledgeLayout breadcrumb={[{ label: "Home", href: "/" }, { label: "Kies je product" }]}>
      <div className="max-w-[800px]">
        <h1 className="text-h1 font-bold text-grijs-900">Voor welk product zoek je hulp?</h1>
        <p className="mt-2 max-w-2xl text-base text-grijs-600">
          MijnLeerlijn bestaat in een aantal varianten, elk afgestemd op een onderwijsvorm. Kies hieronder
          welke jullie school gebruikt.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {varianten.map((variant) => {
          const beschikbaar = variant.status === "actief";

          return (
            <div
              key={variant.slug}
              className={`rounded-lg border border-grijs-200 bg-white p-6 ${!beschikbaar ? "opacity-60" : ""}`}
            >
              <Image
                src={variant.branding.logoUrl}
                alt=""
                aria-hidden
                width={120}
                height={32}
                className="h-8 w-auto"
              />
              <p className="mt-4 text-lg font-semibold text-grijs-900">{variant.branding.productName}</p>
              <p className="mt-1 text-sm text-grijs-600">
                {ONDERWIJSTYPE_LABEL[variant.educationType] ?? variant.educationType}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {variant.branding.isPlaceholder && <Badge tone="warning">Voorbeeldbranding</Badge>}
                {!beschikbaar && <Badge tone="neutral">Binnenkort beschikbaar</Badge>}
              </div>

              {beschikbaar ? (
                <NextLink
                  href="/"
                  className={`mt-6 block rounded-md border border-grijs-200 px-4 py-2 text-center text-sm font-medium text-grijs-900 transition-colors duration-[120ms] hover:border-[var(--variant-accent)] hover:text-[var(--variant-accent)] ${focusRing}`}
                >
                  Naar {variant.branding.productName}
                </NextLink>
              ) : (
                <p className="mt-6 text-sm text-grijs-400">Deze variant is nog in ontwikkeling.</p>
              )}
            </div>
          );
        })}
      </div>
    </KnowledgeLayout>
  );
}
