import type { Payload } from "payload";
import { richTextNaarPlatteTekst } from "@/lib/embeddings/embeddable-text";
import type { PublicManual, PublicStep, PublicStepImage } from "@/lib/assistant/process-public-question";

// Chat delen via URL (2026-08-24) — herbouwt de publiek-veilige
// manuals/steps-weergave (exact dezelfde vorm als de live Helpdesk-chat toont,
// zie lib/assistant/process-public-question.ts's PublicManual/PublicStep) op
// basis van de al opgeslagen, gereduceerde velden op een
// assistant-conversations-record (`sources`/`steps`) — NIET op basis van de
// live retrieval-pijplijn. Bewust een NIEUW, zelfstandig bestand i.p.v.
// bepaalPubliekeManuals/bepaalRelevanteStappen in process-public-question.ts
// te hergebruiken/exporteren: de opdracht is expliciet "niet aanraken:
// Helpdesk-AI retrieval/antwoordlogica" — dit bestand raakt dat bestand op
// geen enkele manier aan (geen import, geen wijziging), en leest uitsluitend
// dezelfde twee collecties (knowledge-sources, handleidingen) read-only, op
// dezelfde manier (zichtbaar-/verborgen-filter) als de live pijplijn al doet.
//
// Bewust GEEN caching/opslag van de herbouwde manuals/steps zelf hier — de
// aanroeper (lib/helpdesk/delen.ts) roept dit precies één keer aan per
// bericht, op het moment dat een deel-link wordt aangemaakt, en slaat de
// UITKOMST als bevroren snapshot op (spec §3: "snapshot op het moment van
// delen"). Een latere zichtbaarheidswijziging van een bron werkt dus nooit
// met terugwerkende kracht door in een al bestaande deel-link.

interface OpgeslagenBron {
  refCollection: string;
  refId: number;
}

interface OpgeslagenStap {
  handleidingId: number;
  stepId: string;
  stepNummer: number;
}

interface ZichtbareBron {
  id: number;
  title: string;
  zichtbaar: boolean | null | undefined;
  file: unknown;
}

/** Spiegelt bepaalPubliekeManuals() (process-public-question.ts) — zelfde zichtbaar-filter, hier op de opgeslagen `sources` i.p.v. live ContextItems. */
export async function bepaalPubliekeManualsVoorSnapshot(payload: Payload, sources: OpgeslagenBron[]): Promise<PublicManual[]> {
  const bronIds = [...new Set(sources.filter((s) => s.refCollection === "knowledge-sources").map((s) => s.refId))];
  if (bronIds.length === 0) return [];

  const bronnen = await payload.find({
    collection: "knowledge-sources",
    where: { id: { in: bronIds } },
    limit: bronIds.length,
    overrideAccess: true,
    depth: 0,
  });

  const byId = new Map((bronnen.docs as ZichtbareBron[]).map((b) => [b.id, b]));
  const manuals: PublicManual[] = [];
  for (const id of bronIds) {
    const bron = byId.get(id);
    if (!bron || !bron.zichtbaar) continue;
    manuals.push({ id: bron.id, title: bron.title, hasFile: Boolean(bron.file) });
  }
  return manuals;
}

interface HandleidingMediaDoc {
  id: number;
  url?: string | null;
  altText?: string | null;
}

interface HandleidingStapDoc {
  id?: string;
  titel: string;
  uitleg: unknown;
  verborgen?: boolean | null;
  media?: { bestand: HandleidingMediaDoc | number | null; onderschrift?: string | null }[] | null;
}

interface HandleidingDoc {
  id: number;
  titel: string;
  slug: string;
  stappen?: HandleidingStapDoc[] | null;
}

/** Spiegelt bepaalRelevanteStappen() (process-public-question.ts) — zelfde verborgen-filter, hier op de opgeslagen {handleidingId, stepId} i.p.v. live ContextItems. */
export async function bepaalRelevanteStappenVoorSnapshot(payload: Payload, steps: OpgeslagenStap[]): Promise<PublicStep[]> {
  if (steps.length === 0) return [];

  const handleidingIds = [...new Set(steps.map((s) => s.handleidingId))];
  const handleidingen = await payload.find({
    collection: "handleidingen",
    where: { id: { in: handleidingIds } },
    limit: handleidingIds.length,
    overrideAccess: true,
    depth: 1,
  });
  const byId = new Map((handleidingen.docs as unknown as HandleidingDoc[]).map((h) => [h.id, h]));

  const stappen: PublicStep[] = [];
  for (const item of steps) {
    const handleiding = byId.get(item.handleidingId);
    if (!handleiding) continue;
    const alleStappen = handleiding.stappen ?? [];
    const stapIndex = alleStappen.findIndex((s) => s.id === item.stepId);
    if (stapIndex === -1) continue;
    const stap = alleStappen[stapIndex]!;
    if (stap.verborgen) continue;

    const images: PublicStepImage[] = (stap.media ?? []).flatMap((m) => {
      const bestand = m.bestand;
      if (!bestand || typeof bestand === "number" || !bestand.url) return [];
      return [{ url: `/api/media/${bestand.id}`, caption: m.onderschrift ?? undefined, alt: bestand.altText ?? stap.titel }];
    });

    stappen.push({
      handleidingId: handleiding.id,
      handleidingSlug: handleiding.slug,
      handleidingTitel: handleiding.titel,
      handleidingUrl: `/handleidingen/${handleiding.slug}`,
      stepId: item.stepId,
      stepNummer: item.stepNummer,
      titel: stap.titel,
      uitleg: richTextNaarPlatteTekst(stap.uitleg),
      images,
    });
  }
  return stappen;
}
