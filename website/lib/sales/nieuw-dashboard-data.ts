import type { Payload } from "payload";
import { haalScholenVoorDashboard } from "./dashboard-data";
import type { MondaySchoolItem } from "./monday-client";
import { SCHOLEN_KOLOM } from "./monday-columns";
import {
  bouwNieuwDashboard,
  splitsLabels,
  verzamelPaginas,
  type NieuwDashboardDoel,
  type NieuwDashboardHistorie,
  type NieuwDashboardModel,
  type NieuwDashboardSchool,
} from "./nieuw-dashboard";

// Alleen lezen. Deze module importeert geen schrijffunctie naar Monday of Payload.

const HISTORIE_PAGINA = 100;
const HISTORIE_MAX_PAGINAS = 100;

function kolom(item: MondaySchoolItem, id: string) {
  return item.column_values.find((waarde) => waarde.id === id);
}

function tekst(item: MondaySchoolItem, id: string): string | null {
  const waarde = kolom(item, id)?.text;
  return waarde && waarde.trim() ? waarde.trim() : null;
}

function nummer(item: MondaySchoolItem, id: string): number {
  const raw = tekst(item, id);
  if (!raw) return 0;
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function naarSchool(item: MondaySchoolItem): NieuwDashboardSchool {
  return {
    id: String(item.id),
    relatiestatus: tekst(item, SCHOLEN_KOLOM.relatiestatus),
    licenties: nummer(item, SCHOLEN_KOLOM.aantalLeerlingen),
    onderwijstypen: splitsLabels(tekst(item, SCHOLEN_KOLOM.typeSchool)),
    bronnen: splitsLabels(tekst(item, SCHOLEN_KOLOM.binnengekomenVia)),
    klantGeworden: tekst(item, SCHOLEN_KOLOM.klantGeworden),
    aangemaaktOp: item.created_at ?? null,
  };
}

function leesLosseWaarde(waarde: unknown): string | number | null {
  if (typeof waarde === "string" || typeof waarde === "number") return waarde;
  return null;
}

function leesHistorie(doc: { occurredAt?: string | null; payload?: unknown }): NieuwDashboardHistorie | null {
  const ruw = doc.payload;
  if (!ruw || typeof ruw !== "object" || Array.isArray(ruw) || !doc.occurredAt) return null;
  const velden = ruw as Record<string, unknown>;
  const mondayItemId = velden.mondayItemId;
  const columnId = velden.columnId;
  if ((typeof mondayItemId !== "string" && typeof mondayItemId !== "number") || typeof columnId !== "string") return null;
  return {
    mondayItemId: String(mondayItemId),
    columnId,
    occurredAt: doc.occurredAt,
    previousValue: leesLosseWaarde(velden.previousValue),
    value: leesLosseWaarde(velden.value),
    soort: typeof velden.soort === "string" ? velden.soort : null,
  };
}

async function haalHistorie(payload: Payload): Promise<{ events: NieuwDashboardHistorie[]; compleet: boolean }> {
  const verzameld = await verzamelPaginas(async (page) => {
    const resultaat = await payload.find({
      collection: "sales-log-events",
      where: { type: { equals: "monday_status" } },
      sort: "occurredAt",
      limit: HISTORIE_PAGINA,
      page,
      depth: 0,
      overrideAccess: true,
    });
    return {
      docs: resultaat.docs.flatMap((doc) => {
        const event = leesHistorie(doc);
        return event ? [event] : [];
      }),
      hasNextPage: resultaat.hasNextPage,
    };
  }, HISTORIE_MAX_PAGINAS);
  return { events: verzameld.docs, compleet: verzameld.compleet };
}

async function haalDoelen(payload: Payload): Promise<NieuwDashboardDoel[]> {
  const resultaat = await payload.find({
    collection: "sales-goals",
    where: { actief: { equals: true } },
    sort: "-startDatum",
    limit: 50,
    depth: 0,
    overrideAccess: true,
  });
  return resultaat.docs as unknown as NieuwDashboardDoel[];
}

async function haalFactor(payload: Payload): Promise<number> {
  try {
    const instellingen = await payload.findGlobal({ slug: "sales-instellingen", overrideAccess: true });
    const factor = (instellingen as { licentiesPerSchoolEquivalent?: number | null }).licentiesPerSchoolEquivalent;
    return factor && factor > 0 ? factor : 200;
  } catch {
    return 200;
  }
}

export async function bouwNieuwSalesDashboardData(payload: Payload): Promise<NieuwDashboardModel> {
  const [items, historie, doelen, factor] = await Promise.all([
    haalScholenVoorDashboard(),
    haalHistorie(payload),
    haalDoelen(payload),
    haalFactor(payload),
  ]);
  return bouwNieuwDashboard({
    scholen: items.map(naarSchool),
    historie: historie.events,
    doelen,
    nu: Date.now(),
    factor,
    historieCompleet: historie.compleet,
    bijgewerktOp: new Date().toISOString(),
  });
}
