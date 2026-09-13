import type { Payload } from "payload";
import { haalScholenPagina, type MondaySchoolItem } from "./monday-client";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "./monday-columns";
import { calculateSalesGoalProgress, type SalesGoalInput, type SalesGoalProgress } from "./goal-progress";

const OPEN_RELATIESTATUSSEN = new Set(["Lead", "Prospect", "Wacht op handtekening"]);
export interface DashboardReeksPunt { label: string; waarde: number }
export interface SalesDashboardData {
  gegenereerdOp: string;
  kpis: {
    klanten: number;
    klantLicenties: number;
    openPipelineScholen: number;
    openPipelineLicenties: number;
    schoolEquivalentFactor: number;
    klantSchoolEquivalenten: number;
    pipelineSchoolEquivalenten: number;
    exactGewonnenScholen: number;
    exactGewonnenLicenties: number;
    exactGewonnenSchoolEquivalenten: number;
  };
  doelstellingen: SalesGoalProgress[];
  funnel: DashboardReeksPunt[];
  pipelineLicentiesPerFase: DashboardReeksPunt[];
  klantenGeworden: DashboardReeksPunt[];
  nieuweKlantenPerMaand: DashboardReeksPunt[];
  nieuweLicentiesPerMaand: DashboardReeksPunt[];
  klantenPerOnderwijstype: DashboardReeksPunt[];
  licentiesPerOnderwijstype: DashboardReeksPunt[];
  klantenPerBron: DashboardReeksPunt[];
  licentiesPerBron: DashboardReeksPunt[];
  historie: {
    transities: number;
    volledigeTransities: number;
    eersteWaardeZonderVorige: number;
    exacteKlantovergangen: number;
    klantovergangenMetExacteLicenties: number;
    klantovergangenMetAfgeleideLicenties: number;
  };
}

type HistoriePayload = {
  mondayItemId?: string | null;
  columnId?: string | null;
  previousValue?: string | number | null;
  value?: string | number | null;
  soort?: string | null;
  bronkwaliteit?: string | null;
};
type HistorieDoc = { occurredAt?: string | null; payload?: HistoriePayload | null };
type LicentieEvent = { op: number; vorige: number | null; nieuwe: number | null };
type KlantWinst = { mondayItemId: string; op: number; licenties: number; licentieBron: "historisch" | "volgende_vorige_waarde" | "huidig" };

function kolom(item: MondaySchoolItem, id: string) { return item.column_values.find((c) => c.id === id); }
function tekst(item: MondaySchoolItem, id: string): string | null { const v = kolom(item, id)?.text; return v && v.trim() ? v.trim() : null; }
function nummer(item: MondaySchoolItem, id: string): number { const raw = tekst(item, id); if (!raw) return 0; const n = Number(raw.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function historischNummer(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function voegToe(map: Map<string, number>, label: string, waarde: number) { map.set(label, (map.get(label) ?? 0) + waarde); }
function reeks(map: Map<string, number>): DashboardReeksPunt[] { return [...map.entries()].map(([label, waarde]) => ({ label, waarde })).sort((a, b) => b.waarde - a.waarde); }
function maandLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("nl-NL", { month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(timestamp));
}
async function haalScholen(): Promise<MondaySchoolItem[]> {
  const alle: MondaySchoolItem[] = []; let cursor: string | null = null;
  do {
    const page = await haalScholenPagina({ boardId: SCHOLEN_BOARD_ID, columnIds: [SCHOLEN_KOLOM.relatiestatus, SCHOLEN_KOLOM.salesfase, SCHOLEN_KOLOM.aantalLeerlingen, SCHOLEN_KOLOM.typeSchool, SCHOLEN_KOLOM.klantGeworden, SCHOLEN_KOLOM.binnengekomenVia, SCHOLEN_KOLOM.whitelabel], limit: 100, cursor });
    alle.push(...page.items); cursor = page.cursor;
  } while (cursor);
  return alle;
}

function bepaalExacteKlantWinsten(historie: HistorieDoc[], huidigeLicenties: Map<string, number>): KlantWinst[] {
  const licentieEventsPerSchool = new Map<string, LicentieEvent[]>();
  const klantOvergangenPerSchool = new Map<string, number[]>();

  for (const doc of historie) {
    const p = doc.payload;
    const itemId = p?.mondayItemId ? String(p.mondayItemId) : null;
    const op = doc.occurredAt ? Date.parse(doc.occurredAt) : Number.NaN;
    if (!itemId || !Number.isFinite(op) || !p?.columnId) continue;

    if (p.columnId === SCHOLEN_KOLOM.aantalLeerlingen || p.soort === "licenties") {
      const events = licentieEventsPerSchool.get(itemId) ?? [];
      events.push({ op, vorige: historischNummer(p.previousValue), nieuwe: historischNummer(p.value) });
      licentieEventsPerSchool.set(itemId, events);
      continue;
    }

    if (p.columnId !== SCHOLEN_KOLOM.relatiestatus) continue;
    const nieuw = String(p.value ?? "").trim().toLowerCase();
    const oud = String(p.previousValue ?? "").trim().toLowerCase();
    if (nieuw !== "klant" || oud === "klant") continue;
    const overgangen = klantOvergangenPerSchool.get(itemId) ?? [];
    overgangen.push(op);
    klantOvergangenPerSchool.set(itemId, overgangen);
  }

  const resultaten: KlantWinst[] = [];
  for (const [itemId, overgangen] of klantOvergangenPerSchool) {
    const eersteKlantOp = Math.min(...overgangen);
    const events = (licentieEventsPerSchool.get(itemId) ?? []).sort((a, b) => a.op - b.op);
    const laatsteVoorOfOp = [...events].reverse().find((e) => e.op <= eersteKlantOp && e.nieuwe !== null);
    if (laatsteVoorOfOp?.nieuwe !== null && laatsteVoorOfOp?.nieuwe !== undefined) {
      resultaten.push({ mondayItemId: itemId, op: eersteKlantOp, licenties: laatsteVoorOfOp.nieuwe, licentieBron: "historisch" });
      continue;
    }
    const eersteNa = events.find((e) => e.op > eersteKlantOp && e.vorige !== null);
    if (eersteNa?.vorige !== null && eersteNa?.vorige !== undefined) {
      resultaten.push({ mondayItemId: itemId, op: eersteKlantOp, licenties: eersteNa.vorige, licentieBron: "volgende_vorige_waarde" });
      continue;
    }
    resultaten.push({ mondayItemId: itemId, op: eersteKlantOp, licenties: huidigeLicenties.get(itemId) ?? 0, licentieBron: "huidig" });
  }
  return resultaten.sort((a, b) => a.op - b.op);
}

async function haalDoelstellingen(payload: Payload, klantWinsten: KlantWinst[], factor: number): Promise<SalesGoalProgress[]> {
  try {
    const resultaat = await payload.find({
      collection: "sales-goals" as never,
      where: { actief: { equals: true } },
      sort: "-startDatum",
      limit: 50,
      depth: 0,
      overrideAccess: true,
    });
    const wins = klantWinsten.map((w) => ({ occurredAt: w.op, licenses: w.licenties }));
    return (resultaat.docs as unknown as SalesGoalInput[])
      .map((doel) => calculateSalesGoalProgress(doel, wins, factor, Date.now()))
      .filter((doel): doel is SalesGoalProgress => doel !== null);
  } catch {
    return [];
  }
}

export async function bouwSalesDashboardData(payload: Payload): Promise<SalesDashboardData> {
  const scholen = await haalScholen();
  const funnel = new Map<string, number>(); const pipelineLicentiesPerFase = new Map<string, number>();
  const klantenGeworden = new Map<string, number>(); const klantenPerOnderwijstype = new Map<string, number>(); const licentiesPerOnderwijstype = new Map<string, number>();
  const klantenPerBron = new Map<string, number>(); const licentiesPerBron = new Map<string, number>();
  const huidigeLicenties = new Map<string, number>();
  let klanten = 0, klantLicenties = 0, openPipelineScholen = 0, openPipelineLicenties = 0;
  for (const school of scholen) {
    const relatie = tekst(school, SCHOLEN_KOLOM.relatiestatus) ?? "Onbekend"; const licenties = nummer(school, SCHOLEN_KOLOM.aantalLeerlingen);
    huidigeLicenties.set(String(school.id), licenties);
    voegToe(funnel, relatie, 1);
    if (OPEN_RELATIESTATUSSEN.has(relatie)) { openPipelineScholen++; openPipelineLicenties += licenties; voegToe(pipelineLicentiesPerFase, relatie, licenties); }
    if (relatie !== "Klant") continue;
    klanten++; klantLicenties += licenties;
    const geworden = tekst(school, SCHOLEN_KOLOM.klantGeworden); if (geworden) voegToe(klantenGeworden, geworden, 1);
    const types = tekst(school, SCHOLEN_KOLOM.typeSchool)?.split(",").map((v) => v.trim()).filter(Boolean) ?? ["Onbekend"];
    for (const type of types) { voegToe(klantenPerOnderwijstype, type, 1); voegToe(licentiesPerOnderwijstype, type, licenties); }
    const bronnen = tekst(school, SCHOLEN_KOLOM.binnengekomenVia)?.split(",").map((v) => v.trim()).filter(Boolean) ?? ["Onbekend"];
    for (const bron of bronnen) { voegToe(klantenPerBron, bron, 1); voegToe(licentiesPerBron, bron, licenties); }
  }
  const historieResult = await payload.find({ collection: "sales-log-events", where: { type: { equals: "monday_status" } }, limit: 5000, depth: 0, overrideAccess: true });
  let volledigeTransities = 0, eersteWaardeZonderVorige = 0;
  const historieDocs = historieResult.docs as unknown as HistorieDoc[];
  for (const doc of historieDocs) { const p = doc.payload; if (p?.bronkwaliteit === "volledig") volledigeTransities++; else if (p?.bronkwaliteit === "alleen_nieuwe_waarde") eersteWaardeZonderVorige++; }
  const klantWinsten = bepaalExacteKlantWinsten(historieDocs, huidigeLicenties);
  const nieuweKlantenPerMaand = new Map<string, number>();
  const nieuweLicentiesPerMaand = new Map<string, number>();
  let exactGewonnenLicenties = 0;
  let klantovergangenMetExacteLicenties = 0;
  let klantovergangenMetAfgeleideLicenties = 0;
  for (const winst of klantWinsten) {
    const maand = maandLabel(winst.op);
    voegToe(nieuweKlantenPerMaand, maand, 1);
    voegToe(nieuweLicentiesPerMaand, maand, winst.licenties);
    exactGewonnenLicenties += winst.licenties;
    if (winst.licentieBron === "huidig") klantovergangenMetAfgeleideLicenties++; else klantovergangenMetExacteLicenties++;
  }
  let schoolEquivalentFactor = 200;
  try { const instellingen = await payload.findGlobal({ slug: "sales-instellingen", overrideAccess: true }); const factor = (instellingen as unknown as { licentiesPerSchoolEquivalent?: number | null }).licentiesPerSchoolEquivalent; if (factor && factor > 0) schoolEquivalentFactor = factor; } catch { /* veilige standaard */ }
  const doelstellingen = await haalDoelstellingen(payload, klantWinsten, schoolEquivalentFactor);
  return {
    gegenereerdOp: new Date().toISOString(),
    kpis: {
      klanten,
      klantLicenties,
      openPipelineScholen,
      openPipelineLicenties,
      schoolEquivalentFactor,
      klantSchoolEquivalenten: klantLicenties / schoolEquivalentFactor,
      pipelineSchoolEquivalenten: openPipelineLicenties / schoolEquivalentFactor,
      exactGewonnenScholen: klantWinsten.length,
      exactGewonnenLicenties,
      exactGewonnenSchoolEquivalenten: exactGewonnenLicenties / schoolEquivalentFactor,
    },
    doelstellingen,
    funnel: reeks(funnel),
    pipelineLicentiesPerFase: reeks(pipelineLicentiesPerFase),
    klantenGeworden: reeks(klantenGeworden),
    nieuweKlantenPerMaand: reeks(nieuweKlantenPerMaand),
    nieuweLicentiesPerMaand: reeks(nieuweLicentiesPerMaand),
    klantenPerOnderwijstype: reeks(klantenPerOnderwijstype),
    licentiesPerOnderwijstype: reeks(licentiesPerOnderwijstype),
    klantenPerBron: reeks(klantenPerBron),
    licentiesPerBron: reeks(licentiesPerBron),
    historie: {
      transities: historieResult.totalDocs,
      volledigeTransities,
      eersteWaardeZonderVorige,
      exacteKlantovergangen: klantWinsten.length,
      klantovergangenMetExacteLicenties,
      klantovergangenMetAfgeleideLicenties,
    },
  };
}
