import type { Payload } from "payload";
import { SCHOLEN_KOLOM } from "./monday-columns";

export interface SalesCycleTimeSummary {
  averageDays: number | null;
  medianDays: number | null;
  completedSchools: number;
  note: string;
}

type HistoryPayload = {
  mondayItemId?: string | null;
  columnId?: string | null;
  value?: string | number | null;
};

type HistoryDoc = {
  occurredAt?: string | null;
  payload?: HistoryPayload | null;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export async function buildSalesCycleTimeSummary(payload: Payload): Promise<SalesCycleTimeSummary> {
  const result = await payload.find({
    collection: "sales-log-events",
    where: { type: { equals: "monday_status" } },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  });

  const perSchool = new Map<string, { lead: number[]; customer: number[] }>();

  for (const doc of result.docs as unknown as HistoryDoc[]) {
    const event = doc.payload;
    if (event?.columnId !== SCHOLEN_KOLOM.relatiestatus || !event.mondayItemId || !doc.occurredAt) continue;

    const timestamp = Date.parse(doc.occurredAt);
    if (!Number.isFinite(timestamp)) continue;

    const status = normalize(event.value);
    if (status !== "lead" && status !== "klant") continue;

    const key = String(event.mondayItemId);
    const current = perSchool.get(key) ?? { lead: [], customer: [] };
    if (status === "lead") current.lead.push(timestamp);
    if (status === "klant") current.customer.push(timestamp);
    perSchool.set(key, current);
  }

  const durations: number[] = [];
  for (const values of perSchool.values()) {
    if (!values.lead.length || !values.customer.length) continue;
    const firstLead = Math.min(...values.lead);
    const firstCustomerAfterLead = values.customer.filter((t) => t >= firstLead).sort((a, b) => a - b)[0];
    if (firstCustomerAfterLead === undefined) continue;
    durations.push((firstCustomerAfterLead - firstLead) / 86_400_000);
  }

  if (!durations.length) {
    return {
      averageDays: null,
      medianDays: null,
      completedSchools: 0,
      note: "Wordt vanaf nu opgebouwd zodra een school zowel Lead als later Klant in de opgeslagen historie heeft.",
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);

  return {
    averageDays: durations.reduce((sum, value) => sum + value, 0) / durations.length,
    medianDays: median,
    completedSchools: durations.length,
    note: "Gemeten vanaf de eerste opgeslagen overgang naar Lead tot de eerste latere overgang naar Klant. Alleen volledig gevolgde trajecten tellen mee.",
  };
}
