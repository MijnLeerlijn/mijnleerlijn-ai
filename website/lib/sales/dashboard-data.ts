import type { Payload } from "payload";
import { haalScholenPagina, type MondaySchoolItem } from "./monday-client";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "./monday-columns";

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
  };
  funnel: DashboardReeksPunt[];
  pipelineLicentiesPerFase: DashboardReeksPunt[];
  klantenGeworden: DashboardReeksPunt[];
  klantenPerOnderwijstype: DashboardReeksPunt[];
  licentiesPerOnderwijstype: DashboardReeksPunt[];
  klantenPerBron: DashboardReeksPunt[];
  licentiesPerBron: DashboardReeksPunt[];
  historie: { transities: number; volledigeTransities: number; eersteWaardeZonderVorige: number };
}
function kolom(item: MondaySchoolItem, id: string) { return item.column_values.find((c) => c.id === id); }
function tekst(item: MondaySchoolItem, id: string): string | null { const v = kolom(item, id)?.text; return v && v.trim() ? v.trim() : null; }
function nummer(item: MondaySchoolItem, id: string): number { const raw = tekst(item, id); if (!raw) return 0; const n = Number(raw.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function voegToe(map: Map<string, number>, label: string, waarde: number) { map.set(label, (map.get(label) ?? 0) + waarde); }
function reeks(map: Map<string, number>): DashboardReeksPunt[] { return [...map.entries()].map(([label, waarde]) => ({ label, waarde })).sort((a, b) => b.waarde - a.waarde); }
async function haalScholen(): Promise<MondaySchoolItem[]> {
  const alle: MondaySchoolItem[] = []; let cursor: string | null = null;
  do {
    const page = await haalScholenPagina({ boardId: SCHOLEN_BOARD_ID, columnIds: [SCHOLEN_KOLOM.relatiestatus, SCHOLEN_KOLOM.salesfase, SCHOLEN_KOLOM.aantalLeerlingen, SCHOLEN_KOLOM.typeSchool, SCHOLEN_KOLOM.klantGeworden, SCHOLEN_KOLOM.binnengekomenVia, SCHOLEN_KOLOM.whitelabel], limit: 100, cursor });
    alle.push(...page.items); cursor = page.cursor;
  } while (cursor);
  return alle;
}
export async function bouwSalesDashboardData(payload: Payload): Promise<SalesDashboardData> {
  const scholen = await haalScholen();
  const funnel = new Map<string, number>(); const pipelineLicentiesPerFase = new Map<string, number>();
  const klantenGeworden = new Map<string, number>(); const klantenPerOnderwijstype = new Map<string, number>(); const licentiesPerOnderwijstype = new Map<string, number>();
  const klantenPerBron = new Map<string, number>(); const licentiesPerBron = new Map<string, number>();
  let klanten = 0, klantLicenties = 0, openPipelineScholen = 0, openPipelineLicenties = 0;
  for (const school of scholen) {
    const relatie = tekst(school, SCHOLEN_KOLOM.relatiestatus) ?? "Onbekend"; const licenties = nummer(school, SCHOLEN_KOLOM.aantalLeerlingen);
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
  for (const doc of historieResult.docs) { const p = (doc as unknown as { payload?: { bronkwaliteit?: string } | null }).payload; if (p?.bronkwaliteit === "volledig") volledigeTransities++; else if (p?.bronkwaliteit === "alleen_nieuwe_waarde") eersteWaardeZonderVorige++; }
  let schoolEquivalentFactor = 200;
  try { const instellingen = await payload.findGlobal({ slug: "sales-instellingen", overrideAccess: true }); const factor = (instellingen as unknown as { licentiesPerSchoolEquivalent?: number | null }).licentiesPerSchoolEquivalent; if (factor && factor > 0) schoolEquivalentFactor = factor; } catch { /* veilige standaard */ }
  return {
    gegenereerdOp: new Date().toISOString(),
    kpis: { klanten, klantLicenties, openPipelineScholen, openPipelineLicenties, schoolEquivalentFactor, klantSchoolEquivalenten: klantLicenties / schoolEquivalentFactor, pipelineSchoolEquivalenten: openPipelineLicenties / schoolEquivalentFactor },
    funnel: reeks(funnel), pipelineLicentiesPerFase: reeks(pipelineLicentiesPerFase), klantenGeworden: reeks(klantenGeworden), klantenPerOnderwijstype: reeks(klantenPerOnderwijstype), licentiesPerOnderwijstype: reeks(licentiesPerOnderwijstype), klantenPerBron: reeks(klantenPerBron), licentiesPerBron: reeks(licentiesPerBron),
    historie: { transities: historieResult.totalDocs, volledigeTransities, eersteWaardeZonderVorige },
  };
}
