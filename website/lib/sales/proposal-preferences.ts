import type { Payload } from "payload";

// Relatie-analyse V1 (2026-08-15) — "AI leert van keuzes": leest recente
// GEACCEPTEERDE/AANGEPASTE volgende_actie-voorstellen en berekent een
// transparante voorkeur (mediaan aantal dagen tussen voorstel en
// uiteindelijk gekozen vervolgdatum, meest gekozen kanaal). Dit is UITSLUITEND
// promptcontext voor lib/sales/relationship-analysis.ts — géén fine-tuning,
// géén modeltraining, geen opgeslagen gewicht. Bij "modified" is de
// daadwerkelijke keuze `finalChoice` (zie lib/sales/proposals.ts) — die gaat
// altijd vóór het oorspronkelijke AI-voorstel, want dat IS de keuze van
// Michel.
export interface ProposalVoorkeur {
  mediaanDagenTotVervolgactie: number | null;
  meestGekozenKanaal: "mail" | "telefoon" | "in_persoon" | "anders" | null;
  aantalVoorstellenGebruikt: number;
}

const MAX_VOORSTELLEN = 100;

interface BeslistProposalRecord {
  createdAt: string;
  proposedDate?: string | null;
  proposedChannel?: string | null;
  finalChoice?: { proposedDate?: string; proposedChannel?: string } | null;
}

function finaleDatum(p: BeslistProposalRecord): string | null {
  return p.finalChoice?.proposedDate ?? p.proposedDate ?? null;
}

function finaalKanaal(p: BeslistProposalRecord): string | null {
  return p.finalChoice?.proposedChannel ?? p.proposedChannel ?? null;
}

function mediaan(waarden: number[]): number | null {
  if (waarden.length === 0) return null;
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const midden = Math.floor(gesorteerd.length / 2);
  return gesorteerd.length % 2 === 0 ? Math.round((gesorteerd[midden - 1]! + gesorteerd[midden]!) / 2) : gesorteerd[midden]!;
}

/**
 * Server-side (Payload Local API) — aanroeper is zelf verantwoordelijk voor
 * autorisatie, zelfde patroon als de rest van lib/sales/*. Neemt alleen
 * "volgende_actie"-voorstellen mee (datum/kanaal zijn bij "veld_correctie"
 * niet van toepassing).
 */
export async function bepaalProposalVoorkeur(payload: Payload): Promise<ProposalVoorkeur> {
  const resultaat = await payload.find({
    collection: "sales-proposals",
    where: { proposalType: { equals: "volgende_actie" }, status: { in: ["accepted", "modified"] } },
    sort: "-createdAt",
    limit: MAX_VOORSTELLEN,
    overrideAccess: true,
    depth: 0,
  });

  const docs = resultaat.docs as unknown as BeslistProposalRecord[];
  const dagenLijst: number[] = [];
  const kanaalTelling = new Map<string, number>();

  for (const p of docs) {
    const datum = finaleDatum(p);
    if (datum) {
      const dagen = Math.round((new Date(datum).getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (Number.isFinite(dagen) && dagen >= 0) dagenLijst.push(dagen);
    }
    const kanaal = finaalKanaal(p);
    if (kanaal) kanaalTelling.set(kanaal, (kanaalTelling.get(kanaal) ?? 0) + 1);
  }

  let meestGekozenKanaal: ProposalVoorkeur["meestGekozenKanaal"] = null;
  let hoogsteTelling = 0;
  for (const [kanaal, telling] of kanaalTelling) {
    if (telling > hoogsteTelling) {
      meestGekozenKanaal = kanaal as ProposalVoorkeur["meestGekozenKanaal"];
      hoogsteTelling = telling;
    }
  }

  return {
    mediaanDagenTotVervolgactie: mediaan(dagenLijst),
    meestGekozenKanaal,
    aantalVoorstellenGebruikt: docs.length,
  };
}
