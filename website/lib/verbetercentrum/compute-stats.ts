// AI Verbetercentrum — pure, testbare aggregatiefunctie voor het
// dashboard bovenaan (KPI's) en het statistiekenblok ("meest gebruikte...").
// Bewust een pure functie los van de route (app/api/verbetercentrum/stats)
// zodat de berekening zonder database/sessie getest kan worden.

export interface ConversatieVoorStats {
  id: number;
  question: string;
  hasAnswer: boolean;
  confidence: number;
  feedbackRating: "geen" | "nuttig" | "niet_nuttig";
  contactFormSubmitted?: boolean | null;
  intentieType?: "opgelost" | "onduidelijk" | "geen-match" | null;
  kennisbasisOnderwerp?: number | { id: number; onderwerp?: string | null } | null;
  gebruikteSynoniem?: string | null;
  steps?: { handleidingId: number }[] | null;
  /** Kennisbasis MijnLeerlijn — Fase 4: door de AI gerapporteerd conflict, zie answer.ts. */
  tegenstrijdigheid?: string | null;
  createdAt: string;
}

export interface AantalMetLabel {
  label: string;
  aantal: number;
}

export interface VerbetercentrumStats {
  totaal: number;
  vandaag: number;
  dezeWeek: number;
  percentageDirectOpgelost: number;
  percentageVerduidelijkingsvragen: number;
  percentageGeenMatch: number;
  gemiddeldeConfidence: number;
  percentageNegatieveFeedback: number;
  percentageContactformulierGebruikt: number;
  /** Kennisbasis MijnLeerlijn — Fase 4: percentage gesprekken met een door de AI gerapporteerde tegenstrijdigheid. */
  percentageTegenstrijdigheden: number;
  meestGesteldeVragen: AantalMetLabel[];
  meestGebruikteOnderwerpen: AantalMetLabel[];
  meestGebruikteHandleidingen: AantalMetLabel[];
  meestGebruikteSynoniemen: AantalMetLabel[];
}

const TOP_N = 10;
const DAG_MS = 24 * 60 * 60 * 1000;

function isZelfdeKalenderdag(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

function percentage(deel: number, totaal: number): number {
  if (totaal === 0) return 0;
  return Math.round((deel / totaal) * 1000) / 10;
}

function telTop(paren: [string, string][]): AantalMetLabel[] {
  // paren: [dedupSleutel, weergavelabel][] — dedupSleutel bepaalt of twee
  // vermeldingen "hetzelfde" zijn (bv. lowercase-tekst), label is wat getoond
  // wordt (behoudt de eerst-geziene schrijfwijze).
  const labels = new Map<string, string>();
  const aantallen = new Map<string, number>();
  for (const [sleutel, label] of paren) {
    if (!labels.has(sleutel)) labels.set(sleutel, label);
    aantallen.set(sleutel, (aantallen.get(sleutel) ?? 0) + 1);
  }
  return [...aantallen.entries()]
    .map(([sleutel, aantal]) => ({ label: labels.get(sleutel)!, aantal }))
    .sort((a, b) => b.aantal - a.aantal)
    .slice(0, TOP_N);
}

export function computeStats(docs: ConversatieVoorStats[], nu: Date = new Date()): VerbetercentrumStats {
  const totaal = docs.length;
  const weekGrens = new Date(nu.getTime() - 7 * DAG_MS);

  const vandaag = docs.filter((d) => isZelfdeKalenderdag(new Date(d.createdAt), nu)).length;
  const dezeWeek = docs.filter((d) => new Date(d.createdAt) >= weekGrens).length;

  const opgelost = docs.filter((d) => d.intentieType === "opgelost").length;
  const onduidelijk = docs.filter((d) => d.intentieType === "onduidelijk").length;
  const geenMatch = docs.filter((d) => d.intentieType === "geen-match").length;
  const negatieveFeedback = docs.filter((d) => d.feedbackRating === "niet_nuttig").length;
  const contactformulierGebruikt = docs.filter((d) => d.contactFormSubmitted).length;
  const tegenstrijdigheden = docs.filter((d) => d.tegenstrijdigheid?.trim()).length;

  // Confidence is alleen een zinvolle retrieval-score bij een echt antwoord
  // (bv. 0 bij een clarification of een mislukking) — meetellen zou het
  // gemiddelde kunstmatig verlagen zonder iets te zeggen over antwoordkwaliteit.
  const beantwoord = docs.filter((d) => d.hasAnswer);
  const gemiddeldeConfidence =
    beantwoord.length === 0
      ? 0
      : Math.round((beantwoord.reduce((som, d) => som + d.confidence, 0) / beantwoord.length) * 10) / 10;

  const meestGesteldeVragen = telTop(
    docs.map((d) => [d.question.trim().toLowerCase(), d.question.trim()] as [string, string])
  );

  const meestGebruikteOnderwerpen = telTop(
    docs
      .filter((d) => d.kennisbasisOnderwerp != null)
      .map((d) => {
        const o = d.kennisbasisOnderwerp!;
        const id = typeof o === "number" ? o : o.id;
        const titel = typeof o === "number" ? `Onderwerp #${o}` : (o.onderwerp ?? `Onderwerp #${o.id}`);
        return [String(id), titel] as [string, string];
      })
  );

  const meestGebruikteHandleidingen = telTop(
    docs.flatMap((d) => {
      const ids = new Set((d.steps ?? []).map((s) => s.handleidingId));
      return [...ids].map((id) => [String(id), `Handleiding #${id}`] as [string, string]);
    })
  );

  const meestGebruikteSynoniemen = telTop(
    docs
      .filter((d): d is ConversatieVoorStats & { gebruikteSynoniem: string } => Boolean(d.gebruikteSynoniem?.trim()))
      .map((d) => [d.gebruikteSynoniem.trim().toLowerCase(), d.gebruikteSynoniem.trim()] as [string, string])
  );

  return {
    totaal,
    vandaag,
    dezeWeek,
    percentageDirectOpgelost: percentage(opgelost, totaal),
    percentageVerduidelijkingsvragen: percentage(onduidelijk, totaal),
    percentageGeenMatch: percentage(geenMatch, totaal),
    gemiddeldeConfidence,
    percentageNegatieveFeedback: percentage(negatieveFeedback, totaal),
    percentageContactformulierGebruikt: percentage(contactformulierGebruikt, totaal),
    percentageTegenstrijdigheden: percentage(tegenstrijdigheden, totaal),
    meestGesteldeVragen,
    meestGebruikteOnderwerpen,
    meestGebruikteHandleidingen,
    meestGebruikteSynoniemen,
  };
}
