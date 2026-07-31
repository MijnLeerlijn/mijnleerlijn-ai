import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPayload } from "payload";
import Link from "next/link";
import { ExternalLink, ArrowLeft } from "lucide-react";
import config from "@/payload.config";
import { haalSessieOp } from "@/services/auth";
import HandleidingStappenLijst, {
  type HandleidingStapVoorPagina,
} from "@/components/organisms/HandleidingStappenLijst";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

interface HandleidingPaginaProps {
  params: Promise<{ slug: string }>;
}

const MIN_STAPPEN_VOOR_INHOUDSOPGAVE = 5;

interface StapDoc {
  id?: string;
  titel: string;
  uitleg: unknown;
  verborgen?: boolean | null;
  waarschuwing?: string | null;
  tip?: string | null;
  media?:
    | {
        bestand?: { id: number; url?: string | null; altText?: string | null } | number | null;
        onderschrift?: string | null;
      }[]
    | null;
}

// Publieke handleidingpagina (Handleidingbouwer) — geen `overrideAccess`,
// de leesregel zit hier expliciet in de query hieronder omdat de Payload
// local API de inkomende sessiecookie niet vanzelf herkent (zelfde reden als
// app/(frontend)/assistant/page.tsx via services/auth.ts werkt): een
// ingelogde beheerder/redacteur ziet ook een concept/gearchiveerde
// handleiding (preview, zie payload/components/HandleidingPreviewLink.tsx),
// een anonieme bezoeker uitsluitend een gepubliceerde. Dit is dezelfde regel
// als payload/access/roles.ts's publishedOverrideOrEditor, hier bewust
// herhaald i.p.v. overrideAccess:true — zo blijft "geen concept in publieke
// uitkomst" een structurele garantie, geen los te vergeten stap.
async function haalHandleiding(slug: string) {
  const payload = await getPayload({ config });
  const sessie = await haalSessieOp();

  const resultaat = await payload.find({
    collection: "handleidingen",
    where: sessie
      ? { slug: { equals: slug } }
      : { and: [{ slug: { equals: slug } }, { status: { equals: "gepubliceerd" } }] },
    limit: 1,
    overrideAccess: true,
    depth: 1,
  });

  return resultaat.docs[0] ?? null;
}

export async function generateMetadata({ params }: HandleidingPaginaProps): Promise<Metadata> {
  const { slug } = await params;
  const [handleiding, variant] = await Promise.all([haalHandleiding(slug), getActiveVariant()]);
  return {
    title: handleiding
      ? `${handleiding.titel} — ${variant.branding.productName}`
      : `Handleiding niet gevonden — ${variant.branding.productName}`,
  };
}

export default async function HandleidingPagina({ params }: HandleidingPaginaProps) {
  const { slug } = await params;
  const handleiding = await haalHandleiding(slug);
  if (!handleiding) notFound();

  const alleStappen = (handleiding.stappen ?? []) as StapDoc[];
  const zichtbareStappen = alleStappen.filter((s) => !s.verborgen && s.id);

  const stappenVoorPagina: HandleidingStapVoorPagina[] = zichtbareStappen.map((stap) => ({
    id: stap.id!,
    titel: stap.titel,
    uitleg: stap.uitleg as HandleidingStapVoorPagina["uitleg"],
    waarschuwing: stap.waarschuwing,
    tip: stap.tip,
    media: (stap.media ?? []).flatMap((m) => {
      const bestand = m.bestand;
      if (!bestand || typeof bestand === "number" || !bestand.url) return [];
      return [
        {
          url: `/api/media/${bestand.id}`,
          caption: m.onderschrift,
          alt: bestand.altText ?? stap.titel,
        },
      ];
    }),
  }));

  const legacyBron =
    typeof handleiding.legacyBron === "object" && handleiding.legacyBron ? handleiding.legacyBron : null;

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-16">
      <Link
        href="/"
        className="mb-6 flex items-center gap-1.5 text-sm text-grijs-600 hover:text-[var(--variant-accent)]"
      >
        <ArrowLeft size={16} aria-hidden />
        Terug naar Helpdesk
      </Link>

      {handleiding.status !== "gepubliceerd" && (
        <div className="mb-6 rounded-md border border-oranje/30 bg-oranje/5 px-4 py-2 text-sm text-grijs-900">
          Preview — deze handleiding is nog niet gepubliceerd ({handleiding.status}), alleen zichtbaar omdat
          je bent ingelogd.
        </div>
      )}

      <h1 className="text-h1 font-bold text-grijs-900">{handleiding.titel}</h1>
      <p className="mt-2 text-base text-grijs-600">{handleiding.korteOmschrijving}</p>

      {stappenVoorPagina.length >= MIN_STAPPEN_VOOR_INHOUDSOPGAVE && (
        <nav aria-label="Inhoudsopgave" className="mt-6 rounded-xl border border-grijs-200 bg-grijs-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-grijs-600">Inhoud</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {stappenVoorPagina.map((stap, i) => (
              <li key={stap.id}>
                <a
                  href={`#stap-${stap.id}`}
                  className="text-sm text-grijs-700 hover:text-[var(--variant-accent)]"
                >
                  {i + 1}. {stap.titel}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-8">
        <HandleidingStappenLijst stappen={stappenVoorPagina} />
      </div>

      {legacyBron && (
        <div className="mt-10 border-t border-grijs-100 pt-6">
          <a
            href={`/api/knowledge/download/${legacyBron.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-[var(--variant-accent)] hover:underline"
          >
            <ExternalLink size={14} aria-hidden />
            Ook beschikbaar als PDF-download: {legacyBron.title}
          </a>
        </div>
      )}
    </div>
  );
}
