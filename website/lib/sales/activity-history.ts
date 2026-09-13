import type { Payload } from "payload";
import { mondayQuery } from "./monday-client";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "./monday-columns";

const HISTORIE_START = "2026-07-01T00:00:00Z";
const ACTIVITEIT_PAGE_SIZE = 500;
const DOELKOLOMMEN = new Set<string>([SCHOLEN_KOLOM.relatiestatus, SCHOLEN_KOLOM.salesfase]);
interface MondayActivityLog { id: string; event: string; entity: string; user_id: string; created_at: string; data: string }
interface ActivityData { pulse_id?: number | string; pulse_name?: string; column_id?: string; column_title?: string; previous_value?: unknown; value?: unknown; action_record_uuid?: string }
export interface SalesHistorieSyncResultaat { opgehaald: number; relevant: number; nieuw: number; bestaand: number; zonderSchool: number; overgeslagen: number; fouten: string[] }

function labelUitWaarde(waarde: unknown): string | null {
  if (!waarde || typeof waarde !== "object") return null;
  const record = waarde as Record<string, unknown>;
  const label = record.label;
  if (label && typeof label === "object") {
    const tekst = (label as Record<string, unknown>).text;
    if (typeof tekst === "string" && tekst.trim()) return tekst.trim();
  }
  const gekozen = record.chosenValues;
  if (Array.isArray(gekozen)) {
    const namen = gekozen.map((v) => v && typeof v === "object" ? (v as Record<string, unknown>).name : null).filter((v): v is string => typeof v === "string" && Boolean(v.trim()));
    return namen.length ? namen.join(", ") : null;
  }
  if (typeof record.text === "string" && record.text.trim()) return record.text.trim();
  if (typeof record.value === "string" && record.value.trim()) return record.value.trim();
  if (typeof record.value === "number") return String(record.value);
  return null;
}
function activityTimestampNaarIso(raw: string): string {
  try { return new Date(Number(BigInt(raw) / BigInt(10000))).toISOString(); }
  catch { const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(); }
}
async function haalActivityPagina(vanaf: string, tot: string, page: number): Promise<MondayActivityLog[]> {
  // Deze exacte queryvorm (incl. [String!]) is 13-09-2026 read-only tegen
  // board 18420120365 getest en gaf echte before/after-statusregels terug.
  const query = `query SalesActivityHistory($boardId: ID!, $from: ISO8601DateTime!, $to: ISO8601DateTime!, $columnIds: [String!], $limit: Int, $page: Int) { boards(ids: [$boardId]) { activity_logs(from: $from, to: $to, column_ids: $columnIds, limit: $limit, page: $page) { id event entity user_id created_at data } } }`;
  const data = await mondayQuery<{ boards: { activity_logs: MondayActivityLog[] }[] }>(query, { boardId: SCHOLEN_BOARD_ID, from: vanaf, to: tot, columnIds: [...DOELKOLOMMEN], limit: ACTIVITEIT_PAGE_SIZE, page });
  return data.boards[0]?.activity_logs ?? [];
}
async function haalAlleActivity(vanaf: string, tot: string): Promise<MondayActivityLog[]> {
  const alle: MondayActivityLog[] = [];
  for (let page = 1; page <= 25; page++) { const regels = await haalActivityPagina(vanaf, tot, page); alle.push(...regels); if (regels.length < ACTIVITEIT_PAGE_SIZE) break; }
  return alle;
}
function parseActivityData(raw: string): ActivityData | null { try { const parsed = JSON.parse(raw) as unknown; return parsed && typeof parsed === "object" ? parsed as ActivityData : null; } catch { return null; } }

export async function synchroniseerSalesHistorie(payload: Payload, opties?: { vanaf?: string; tot?: string }): Promise<SalesHistorieSyncResultaat> {
  const vanaf = opties?.vanaf ?? HISTORIE_START; const tot = opties?.tot ?? new Date().toISOString();
  const resultaat: SalesHistorieSyncResultaat = { opgehaald: 0, relevant: 0, nieuw: 0, bestaand: 0, zonderSchool: 0, overgeslagen: 0, fouten: [] };
  const activity = await haalAlleActivity(vanaf, tot); resultaat.opgehaald = activity.length;
  const scholenResultaat = await payload.find({ collection: "sales-schools", limit: 5000, depth: 0, overrideAccess: true });
  const schoolPerMondayId = new Map<string, number>();
  for (const doc of scholenResultaat.docs) { const school = doc as unknown as { id: number; mondayItemId?: string | null }; if (school.mondayItemId) schoolPerMondayId.set(String(school.mondayItemId), school.id); }
  const kandidaten = activity.flatMap((regel) => { if (regel.event !== "update_column_value") return []; const data = parseActivityData(regel.data); if (!data?.column_id || !DOELKOLOMMEN.has(data.column_id) || !data.pulse_id) return []; return [{ regel, data }]; });
  resultaat.relevant = kandidaten.length;
  const bronIds = kandidaten.map(({ regel }) => `monday-activity:${regel.id}`); const bestaandeIds = new Set<string>();
  for (let i = 0; i < bronIds.length; i += 100) { const bestaande = await payload.find({ collection: "sales-log-events", where: { sourceExternalId: { in: bronIds.slice(i, i + 100) } }, limit: 200, depth: 0, overrideAccess: true }); for (const doc of bestaande.docs) { const id = (doc as unknown as { sourceExternalId?: string | null }).sourceExternalId; if (id) bestaandeIds.add(id); } }
  for (const { regel, data } of kandidaten) {
    const sourceExternalId = `monday-activity:${regel.id}`; if (bestaandeIds.has(sourceExternalId)) { resultaat.bestaand++; continue; }
    const schoolId = schoolPerMondayId.get(String(data.pulse_id)); if (!schoolId) { resultaat.zonderSchool++; continue; }
    const vorige = labelUitWaarde(data.previous_value); const nieuwe = labelUitWaarde(data.value); if (vorige === nieuwe) { resultaat.overgeslagen++; continue; }
    const columnTitle = data.column_title || (data.column_id === SCHOLEN_KOLOM.relatiestatus ? "Relatiestatus" : "Salesfase"); const bronkwaliteit = vorige === null ? "alleen_nieuwe_waarde" : "volledig";
    try { await payload.create({ collection: "sales-log-events", data: { school: schoolId, occurredAt: activityTimestampNaarIso(regel.created_at), type: "monday_status", source: "monday", sourceExternalId, summary: `${columnTitle}: ${vorige ?? "leeg"} → ${nieuwe ?? "leeg"}`, payload: { activityEventId: regel.id, actionRecordUuid: data.action_record_uuid ?? null, mondayUserId: regel.user_id, columnId: data.column_id, columnTitle, previousValue: vorige, value: nieuwe, bronkwaliteit } }, overrideAccess: true }); resultaat.nieuw++; }
    catch (error) { resultaat.fouten.push(`${regel.id}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return resultaat;
}
