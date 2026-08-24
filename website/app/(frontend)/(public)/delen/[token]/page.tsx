import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getPayload } from "payload";
import { FileText, ExternalLink, ArrowLeft } from "lucide-react";
import config from "@/payload.config";
import { haalGedeeldeChat, type GedeeldeChatWeergave } from "@/lib/helpdesk/delen";
import MarkdownAnswer from "@/components/molecules/MarkdownAnswer";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

interface DeelPaginaProps {
  params: Promise<{ token: string }>;
}

// Chat delen via URL (2026-08-24) — publieke, snapshot-weergave van een
// eerder gedeeld Helpdesk-gesprek (spec §A2/§A3/§A7). Leest rechtstreeks via
// lib/helpdesk/delen.ts se haalGedeeldeChat() — geen aparte API-route nodig,
// dit IS al de enige consument. Nooit doorpraten in dit gesprek (spec §A3:
// "geen live meekijklink") — bewust geen invoerveld/formulier hier, uitsluitend
// de al bevroren berichten plus een CTA naar de gewone Helpdesk-chat (`/`).
//
// noindex/nofollow (spec §A8): eerste toepassing van `robots` in dit project
// (geen bestaand precedent om te spiegelen, zie het onderzoeksverslag) — een
// gedeeld gesprek mag nooit in een zoekmachine terechtkomen.
export async function generateMetadata({ params }: DeelPaginaProps): Promise<Metadata> {
  const variant = await getActiveVariant();
  return {
    title: `Gedeeld gesprek — ${variant.branding.productName} Helpdesk`,
    robots: { index: false, follow: false },
  };
}

function formatGedeeldOp(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

async function haalData(token: string): Promise<GedeeldeChatWeergave | null> {
  // Lichte vormcontrole vóór de databaselookup — een duidelijk ongeldige
  // tokenvorm hoeft nooit tegen de database gehasht/vergeleken te worden.
  // Geen beveiligingsgrens op zich (een ontbrekende/ingetrokken token geeft
  // hieronder toch al hetzelfde "niet beschikbaar"-resultaat), puur hygiëne.
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;

  const payload = await getPayload({ config });
  const uitkomst = await haalGedeeldeChat(payload, token);
  return uitkomst.soort === "ok" ? uitkomst.data : null;
}

export default async function DeelPagina({ params }: DeelPaginaProps) {
  const { token } = await params;
  const data = await haalData(token);

  if (!data) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-8">
        <h1 className="text-h2 font-bold text-grijs-900">Deze gedeelde chat is niet meer beschikbaar.</h1>
        <p className="mt-3 text-base text-grijs-600">
          De link is ingetrokken, of bestaat niet (meer). Je kunt wel altijd een nieuwe vraag stellen.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-[var(--variant-accent)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          <ArrowLeft size={16} aria-hidden />
          Naar de Helpdesk
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
      <div className="mb-8 border-b border-grijs-100 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-grijs-500">Gedeeld gesprek — MijnLeerlijn Helpdesk</p>
        <h1 className="mt-1 text-h2 font-bold text-grijs-900">Gedeeld gesprek</h1>
        <p className="mt-2 text-sm text-grijs-500">Gedeeld op {formatGedeeldOp(data.gedeeldOp)}</p>
      </div>

      <div className="flex flex-col gap-6">
        {data.berichten.map((bericht, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="ml-auto max-w-[85%] rounded-xl bg-[var(--variant-accent)] px-4 py-2.5 text-sm text-white sm:max-w-[70%]">
              {bericht.vraag}
            </div>

            <div className="max-w-[85%] rounded-xl border border-grijs-200 border-t-2 border-t-[var(--variant-accent)] bg-white p-5 shadow-sm sm:max-w-[70%]">
              <MarkdownAnswer tekst={bericht.antwoord} />

              {bericht.steps.length > 0 && (
                <div className="mt-4 flex flex-col gap-4 border-t border-grijs-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-grijs-500">
                    Relevante stap{bericht.steps.length > 1 ? "pen" : ""} uit de handleiding
                  </p>
                  {bericht.steps.map((stap) => (
                    <div key={`${stap.handleidingId}-${stap.stepId}`} className="flex flex-col gap-2">
                      <p className="text-sm font-semibold text-grijs-900">
                        Stap {stap.stepNummer} — {stap.titel}
                      </p>
                      <p className="text-sm leading-6 text-grijs-700">{stap.uitleg}</p>
                      {stap.images.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {stap.images.map((afbeelding, j) => (
                            <div key={`${afbeelding.url}-${j}`} className="flex flex-col overflow-hidden rounded-lg border border-grijs-200">
                              <Image
                                src={afbeelding.url}
                                alt={afbeelding.alt}
                                width={320}
                                height={200}
                                className="h-auto w-full max-w-[280px] object-cover"
                              />
                              {afbeelding.caption && (
                                <span className="bg-grijs-50 px-2 py-1 text-left text-xs text-grijs-600">{afbeelding.caption}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {[...new Map(bericht.steps.map((s) => [s.handleidingUrl, s])).values()].map((s) => (
                    <a
                      key={s.handleidingUrl}
                      href={s.handleidingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 self-start text-sm text-[var(--variant-accent)] hover:underline"
                    >
                      <ExternalLink size={14} aria-hidden />
                      Bekijk de volledige handleiding &ldquo;{s.handleidingTitel}&rdquo;
                    </a>
                  ))}
                </div>
              )}

              {bericht.manuals.length > 0 && (
                <div className="mt-4 border-t border-grijs-100 pt-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-grijs-500">
                    <FileText size={14} aria-hidden className="text-[var(--variant-accent)]" />
                    Bekijk handleiding{bericht.manuals.length > 1 ? "en" : ""}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {bericht.manuals.map((manual) => (
                      <li key={manual.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm">
                        <span className="text-grijs-900">{manual.title}</span>
                        {manual.hasFile && (
                          <a
                            href={`/api/knowledge/download/${manual.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex shrink-0 items-center gap-1 text-[var(--variant-accent)] hover:underline"
                          >
                            <ExternalLink size={14} aria-hidden />
                            Openen
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 border-t border-grijs-100 pt-8 text-center">
        <p className="text-sm text-grijs-600">Heb je zelf een vraag?</p>
        <Link
          href="/"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--variant-accent)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Zelf een vraag stellen aan MijnLeerlijn
        </Link>
      </div>
    </div>
  );
}
