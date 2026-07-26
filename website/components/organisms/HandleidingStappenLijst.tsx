"use client";

import { useState } from "react";
import { AlertTriangle, Lightbulb, X } from "lucide-react";
import Image from "next/image";
import { RichText, defaultJSXConverters } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "lexical";

export interface HandleidingStapAfbeelding {
  url: string;
  caption?: string | null;
  alt: string;
}

export interface HandleidingStapVoorPagina {
  id: string;
  titel: string;
  uitleg: SerializedEditorState;
  media: HandleidingStapAfbeelding[];
  waarschuwing?: string | null;
  tip?: string | null;
}

// Publieke handleidingpagina — stappen onder elkaar, afbeeldingen direct
// onder de bijbehorende stap, waarschuwing/tip in dezelfde visuele stijl als
// de bestaande WaarschuwingBlock/TipBlock (components/molecules/ArtikelBlok.tsx)
// voor consistentie met de rest van de site. Eigen client component (i.p.v.
// alles in de servercomponent page.tsx) omdat alleen de "klik voor grotere
// weergave"-lightbox interactiviteit nodig heeft — de rest blijft server-
// gerenderd via de props hieronder.
export default function HandleidingStappenLijst({ stappen }: { stappen: HandleidingStapVoorPagina[] }) {
  const [vergroteAfbeelding, setVergroteAfbeelding] = useState<HandleidingStapAfbeelding | null>(null);

  return (
    <div className="flex flex-col gap-10">
      {stappen.map((stap, i) => (
        <section key={stap.id} id={`stap-${stap.id}`} className="scroll-mt-24">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--variant-accent)] text-sm font-semibold text-white">
              {i + 1}
            </span>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-grijs-900">{stap.titel}</h2>
              <div className="mt-2 text-sm leading-6 text-grijs-900 [&_a]:text-[var(--variant-accent)] [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:list-disc">
                <RichText data={stap.uitleg} converters={defaultJSXConverters} />
              </div>

              {stap.media.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {stap.media.map((afbeelding, j) => (
                    <button
                      key={`${afbeelding.url}-${j}`}
                      type="button"
                      onClick={() => setVergroteAfbeelding(afbeelding)}
                      className="group flex flex-col overflow-hidden rounded-lg border border-grijs-200"
                    >
                      <Image
                        src={afbeelding.url}
                        alt={afbeelding.alt}
                        width={480}
                        height={300}
                        className="h-auto w-full max-w-[420px] object-cover transition-opacity duration-[120ms] group-hover:opacity-80"
                      />
                      {afbeelding.caption && (
                        <span className="bg-grijs-50 px-2 py-1 text-left text-xs text-grijs-600">
                          {afbeelding.caption}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {stap.waarschuwing && (
                <div className="mt-4 flex gap-3 rounded-md border-l-4 border-oranje bg-oranje/5 p-4">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0 text-oranje" />
                  <div>
                    <p className="text-sm font-semibold text-grijs-900">Waarschuwing</p>
                    <p className="mt-1 text-sm leading-5 text-grijs-900">{stap.waarschuwing}</p>
                  </div>
                </div>
              )}

              {stap.tip && (
                <div className="mt-4 flex gap-3 rounded-md border-l-4 border-geel bg-geel/10 p-4">
                  <Lightbulb size={20} className="mt-0.5 shrink-0 text-[#8a6b03]" />
                  <div>
                    <p className="text-sm font-semibold text-grijs-900">Tip</p>
                    <p className="mt-1 text-sm leading-5 text-grijs-900">{stap.tip}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ))}

      {vergroteAfbeelding && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={vergroteAfbeelding.alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-donkerblauw/80 p-6"
          onClick={() => setVergroteAfbeelding(null)}
        >
          <button
            type="button"
            onClick={() => setVergroteAfbeelding(null)}
            aria-label="Sluiten"
            className="absolute right-6 top-6 text-white/80 hover:text-white"
          >
            <X size={28} aria-hidden />
          </button>
          <Image
            src={vergroteAfbeelding.url}
            alt={vergroteAfbeelding.alt}
            width={1200}
            height={800}
            className="max-h-[85vh] w-auto max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
