import { SCHOLEN_KOLOM } from "./monday-columns";
import { calculateSalesGoalProgress, type SalesGoalInput, type SalesGoalProgress } from "./goal-progress";

/**
 * Nieuw salesdashboard (beta).
 *
 * Monday-board "1: Scholen" is de actuele stand: licenties = aantal leerlingen,
 * relatiestatus = funnel. Een cel met meerdere onderwijstypen of bronnen telt
 * één keer, onder "Meerdere", zodat totalen kloppen.
 *
 * Wanneer een school klant werd komt uit de statushistorie (eerste overgang
 * naar Klant). Zonder dat tijdstip telt de school niet mee in maanden of
 * halfjaren. Halfjaren lopen vanaf H1 2026. Het verschil met de live
 * Monday-stand staat op een aparte correctieregel.
 */

export type DashboardEenheid = "licenties" | "scholen";
export type DashboardPeriode = "half" | "jaar";

export interface Maat {
  scholen: number;
  licenties: number;
}

export interface NieuwDashboardSchool {
  id: string;
  relatiestatus: string | null;
  licenties: number;
  onderwijstypen: string[];
  bronnen: string[];
  klantGeworden: string | null;
  /** Monday item created_at. Alleen gebruikt als er geen statushistorie is. */
  aangemaaktOp?: string | null;
  naam?: string | null;
}

export interface NieuwDashboardHistorie {
  mondayItemId: string;
  columnId: string;
  occurredAt: string;
  previousValue?: string | number | null;
  value?: string | number | null;
  soort?: string | null;
}

export interface NieuwDashboardDoel {
  id: string | number;
  naam?: string | null;
  startDatum?: string | null;
  eindDatum?: string | null;
  doelLicenties?: number | null;
  actief?: boolean | null;
}

export interface TypeRij {
  naam: string;
  lead: Maat;
  prospect: Maat;
  wacht: Maat;
  klant: Maat;
  gestopt: Maat;
  inactief: Maat;
  overig: Maat;
  potentie: Maat;
}

export interface SchoolRegel {
  naam: string;
  scholen: number;
  licenties: number;
}

export interface MaandRij {
  sleutel: string;
  label: string;
  jaar: number;
  half: 1 | 2;
  erbij: Maat;
  eraf: Maat;
  netto: Maat;
  eindstand: Maat;
  erbijScholen: SchoolRegel[];
  erafScholen: SchoolRegel[];
  isNu: boolean;
  correctie: boolean;
}

export interface PipelineMaandRij {
  sleutel: string;
  label: string;
  nieuw: Maat;
  klantGeworden: Maat;
  afgevallen: Maat;
  netto: Maat;
  eindstand: Maat;
  nieuwScholen: SchoolRegel[];
  klantGewordenScholen: SchoolRegel[];
  afgevallenScholen: SchoolRegel[];
  isNu: boolean;
  correctie: boolean;
}

export interface HalfjaarRij {
  label: string;
  jaar: number;
  half: 1 | 2;
  nieuw: Maat;
  lopend: boolean;
}

export interface BronRij {
  naam: string;
  klanten: Maat;
  pipeline: Maat;
}

export interface DoelKaart {
  id: string;
  naam: string;
  startDatum: string;
  eindDatum: string;
  gerealiseerd: Maat;
  doelLicenties: number;
  doelScholenIndicatie: number;
  percentageLicenties: number;
  percentageScholen: number;
  tempoLicenties: number;
  tempoScholen: number;
  verschilLicenties: number;
  verschilScholen: number;
  status: SalesGoalProgress["status"];
  prognoseLicenties: number | null;
  prognoseScholen: number | null;
  periodeVerstrekenPercentage: number;
  maandDoelLicenties: number;
  maandDoelScholen: number;
}

export interface FunnelStand {
  lead: Maat;
  prospect: Maat;
  wacht: Maat;
  klant: Maat;
  gestopt: Maat;
  inactief: Maat;
  overig: Maat;
}

export interface NieuwDashboardModel {
  bijgewerktOp: string;
  factor: number;
  gemLicentiesPerKlant: number | null;
  periodeLabels: { half: string; jaar: string };
  klanten: Maat;
  pipeline: Maat;
  dezeMaandNetto: Maat;
  nieuwInPeriode: { half: Maat; jaar: Maat };
  doelen: { half: DoelKaart | null; jaar: DoelKaart | null };
  maanden: MaandRij[];
  pipelineMaanden: PipelineMaandRij[];
  pipelineHistorieDun: boolean;
  funnel: FunnelStand;
  typen: TypeRij[];
  halfjaren: HalfjaarRij[];
  bronnen: BronRij[];
  kwaliteitTekst: string;
}

const LEGE_MAAT: Maat = { scholen: 0, licenties: 0 };
const TIJDZONE = "Europe/Amsterdam";

export function maat(scholen = 0, licenties = 0): Maat {
  return { scholen, licenties };
}

/** Komma is het scheidingsteken van een Monday-dropdown met meerdere waarden. */
export function splitsLabels(raw: string | null | undefined): string[] {
  return raw?.split(",").map((deel) => deel.trim()).filter(Boolean) ?? [];
}

export function plus(a: Maat, b: Maat): Maat {
  return { scholen: a.scholen + b.scholen, licenties: a.licenties + b.licenties };
}

export function minMaat(a: Maat, b: Maat): Maat {
  return { scholen: a.scholen - b.scholen, licenties: a.licenties - b.licenties };
}

/** Percentages op 1 decimaal die samen exact 100 zijn. Bij een lege som allemaal 0. */
export function aandelen(waarden: number[]): number[] {
  const totaal = waarden.reduce((som, waarde) => som + waarde, 0);
  if (totaal <= 0) return waarden.map(() => 0);
  const exact = waarden.map((waarde) => (waarde / totaal) * 1000);
  const basis = exact.map((waarde) => Math.floor(waarde + 1e-9));
  let rest = 1000 - basis.reduce((som, waarde) => som + waarde, 0);
  const volgorde = exact
    .map((waarde, index) => ({ index, restant: waarde - Math.floor(waarde + 1e-9) }))
    .sort((a, b) => b.restant - a.restant || a.index - b.index);
  for (const item of volgorde) {
    if (rest <= 0) break;
    basis[item.index] = (basis[item.index] ?? 0) + 1;
    rest -= 1;
  }
  return basis.map((waarde) => waarde / 10);
}

export function waarde(van: Maat, eenheid: DashboardEenheid): number {
  return eenheid === "licenties" ? van.licenties : van.scholen;
}

export function conversie(klanten: number, pipeline: number): number | null {
  const totaal = klanten + pipeline;
  if (totaal <= 0) return null;
  return (klanten / totaal) * 100;
}

export function doorstroom(vanafOfVerder: number, totOfVerder: number): number | null {
  if (vanafOfVerder <= 0) return null;
  return (totOfVerder / vanafOfVerder) * 100;
}

export function parseHalfjaarLabel(label: string | null | undefined): { jaar: number; half: 1 | 2 } | { jaar: number; half: null } | null {
  if (!label) return null;
  const tekst = label.trim().toLowerCase().replace(/\s+/g, " ");
  const metHalf = (half: number, jaar: number) => ({ half: half === 1 ? 1 as const : 2 as const, jaar });
  let match = tekst.match(/^h([12])\s*(\d{4})$/);
  if (match) return metHalf(Number(match[1]), Number(match[2]));
  match = tekst.match(/^(\d{4})\s*h([12])$/);
  if (match) return metHalf(Number(match[2]), Number(match[1]));
  match = tekst.match(/^([12])e\s+(?:half(?:jaar)?|helft)\s+(\d{4})$/);
  if (match) return metHalf(Number(match[1]), Number(match[2]));
  match = tekst.match(/^(eerste|tweede)\s+(?:halfjaar|helft)\s+(\d{4})$/);
  if (match) return metHalf(match[1] === "eerste" ? 1 : 2, Number(match[2]));
  match = tekst.match(/^(\d{4})$/);
  if (match) return { jaar: Number(match[1]), half: null };
  return null;
}

export function bepaalDashboardKeuze(query: string | null | undefined, opgeslagen: string | null | undefined): "huidig" | "nieuw" {
  if (query === "nieuw" || query === "huidig") return query;
  if (opgeslagen === "nieuw" || opgeslagen === "huidig") return opgeslagen;
  return "huidig";
}

export async function verzamelPaginas<T>(
  pagina: (page: number) => Promise<{ docs: T[]; hasNextPage: boolean }>,
  maxPaginas: number,
): Promise<{ docs: T[]; compleet: boolean }> {
  const docs: T[] = [];
  for (let page = 1; page <= maxPaginas; page++) {
    const resultaat = await pagina(page);
    docs.push(...resultaat.docs);
    if (!resultaat.hasNextPage) return { docs, compleet: true };
  }
  return { docs, compleet: false };
}

function kalenderVan(timestamp: number): { jaar: number; maand: number; half: 1 | 2 } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIJDZONE, year: "numeric", month: "2-digit" }).formatToParts(new Date(timestamp));
  const jaar = Number(parts.find((p) => p.type === "year")?.value);
  const maand = Number(parts.find((p) => p.type === "month")?.value);
  return { jaar, maand, half: maand <= 6 ? 1 : 2 };
}

function middernachtAmsterdam(jaar: number, maand: number, dag: number): number {
  const utc = Date.UTC(jaar, maand - 1, dag);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIJDZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utc));
  const lees = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const uur = lees("hour") === 24 ? 0 : lees("hour");
  const alsUtc = Date.UTC(lees("year"), lees("month") - 1, lees("day"), uur, lees("minute"));
  return utc - (alsUtc - utc);
}

function maandSleutel(timestamp: number): string {
  const { jaar, maand } = kalenderVan(timestamp);
  return `${jaar}-${String(maand).padStart(2, "0")}`;
}

function maandLabel(sleutel: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(sleutel);
  if (!match) return sleutel;
  return new Intl.DateTimeFormat("nl-NL", { month: "short", year: "numeric", timeZone: TIJDZONE })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function eindeVanMaand(sleutel: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(sleutel);
  if (!match) return 0;
  const jaar = Number(match[1]);
  const maand = Number(match[2]);
  const volgendeMaand = maand === 12 ? 1 : maand + 1;
  const volgendJaar = maand === 12 ? jaar + 1 : jaar;
  return middernachtAmsterdam(volgendJaar, volgendeMaand, 1) - 1;
}

export function kalenderPeriode(nu: number, soort: DashboardPeriode): { start: number; eind: number; label: string } {
  const { jaar, half } = kalenderVan(nu);
  if (soort === "jaar") {
    return { start: middernachtAmsterdam(jaar, 1, 1), eind: middernachtAmsterdam(jaar + 1, 1, 1) - 1, label: String(jaar) };
  }
  if (half === 1) {
    return { start: middernachtAmsterdam(jaar, 1, 1), eind: middernachtAmsterdam(jaar, 7, 1) - 1, label: `H1 ${jaar}` };
  }
  return { start: middernachtAmsterdam(jaar, 7, 1), eind: middernachtAmsterdam(jaar + 1, 1, 1) - 1, label: `H2 ${jaar}` };
}

function halvesSinds2026(nu: number): { jaar: number; half: 1 | 2; label: string; lopend: boolean }[] {
  const huidig = kalenderVan(nu);
  if (huidig.jaar < 2026) return [];
  const uit: { jaar: number; half: 1 | 2; label: string; lopend: boolean }[] = [];
  let jaar = 2026;
  let half: 1 | 2 = 1;
  while (jaar < huidig.jaar || (jaar === huidig.jaar && half <= huidig.half)) {
    uit.push({ jaar, half, label: `H${half} ${jaar}`, lopend: jaar === huidig.jaar && half === huidig.half });
    if (half === 1) half = 2;
    else { half = 1; jaar += 1; }
    if (uit.length > 24) break;
  }
  return uit;
}

function laatsteMaanden(nu: number): string[] {
  const { jaar, maand } = kalenderVan(nu);
  const sleutels: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const totaal = jaar * 12 + (maand - 1) - i;
    const j = Math.floor(totaal / 12);
    const m = (totaal % 12) + 1;
    sleutels.push(`${j}-${String(m).padStart(2, "0")}`);
  }
  return sleutels;
}

function canonStatus(raw: string | null | undefined): "Lead" | "Prospect" | "Wacht op handtekening" | "Klant" | "Gestopt" | "Inactief" | "Overig" {
  const tekst = (raw ?? "").trim().toLowerCase();
  if (tekst === "lead") return "Lead";
  if (tekst === "prospect") return "Prospect";
  if (tekst === "wacht op handtekening") return "Wacht op handtekening";
  if (tekst === "klant") return "Klant";
  if (tekst === "gestopt") return "Gestopt";
  if (tekst === "inactief") return "Inactief";
  return "Overig";
}

function bucket(labels: string[]): string {
  const uniek = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
  if (uniek.length === 0) return "Onbekend";
  if (uniek.length > 1) return "Meerdere";
  return uniek[0] ?? "Onbekend";
}

function historischNummer(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

interface SchoolTijd {
  eersteKlantOp: number | null;
  licentiesBijKlant: number;
  vertrekOp: number | null;
}

function bepaalTijden(scholen: NieuwDashboardSchool[], historie: NieuwDashboardHistorie[]): Map<string, SchoolTijd> {
  const licentieEvents = new Map<string, { op: number; vorige: number | null; nieuwe: number | null }[]>();
  const klantOvergangen = new Map<string, number[]>();
  const vertrekken = new Map<string, number[]>();
  const huidige = new Map(scholen.map((school) => [school.id, school.licenties]));

  for (const event of historie) {
    const id = event.mondayItemId?.trim();
    const op = Date.parse(event.occurredAt);
    if (!id || !Number.isFinite(op) || !event.columnId) continue;
    if (event.columnId === SCHOLEN_KOLOM.aantalLeerlingen || event.soort === "licenties") {
      const lijst = licentieEvents.get(id) ?? [];
      lijst.push({ op, vorige: historischNummer(event.previousValue), nieuwe: historischNummer(event.value) });
      licentieEvents.set(id, lijst);
      continue;
    }
    if (event.columnId !== SCHOLEN_KOLOM.relatiestatus) continue;
    const nieuw = String(event.value ?? "").trim().toLowerCase();
    const oud = String(event.previousValue ?? "").trim().toLowerCase();
    if (nieuw === "klant" && oud !== "klant") {
      const lijst = klantOvergangen.get(id) ?? [];
      lijst.push(op);
      klantOvergangen.set(id, lijst);
    }
    if (oud === "klant" && nieuw !== "klant") {
      const lijst = vertrekken.get(id) ?? [];
      lijst.push(op);
      vertrekken.set(id, lijst);
    }
  }

  const tijden = new Map<string, SchoolTijd>();
  for (const [id, overgangen] of klantOvergangen) {
    const eersteKlantOp = Math.min(...overgangen);
    const events = (licentieEvents.get(id) ?? []).sort((a, b) => a.op - b.op);
    const laatsteVoor = [...events].reverse().find((event) => event.op <= eersteKlantOp && event.nieuwe !== null);
    const eersteNa = events.find((event) => event.op > eersteKlantOp && event.vorige !== null);
    const licentiesBijKlant = laatsteVoor?.nieuwe ?? eersteNa?.vorige ?? huidige.get(id) ?? 0;
    const school = scholen.find((item) => item.id === id);
    const nuKlant = school ? canonStatus(school.relatiestatus) === "Klant" : false;
    const vertrekOp = nuKlant ? null : (vertrekken.get(id) ?? []).filter((op) => op > eersteKlantOp).sort((a, b) => a - b)[0] ?? null;
    tijden.set(id, { eersteKlantOp, licentiesBijKlant, vertrekOp });
  }
  return tijden;
}

function classificeerDoel(doel: NieuwDashboardDoel): "half" | "jaar" | null {
  const start = doel.startDatum ? Date.parse(doel.startDatum) : Number.NaN;
  const eind = doel.eindDatum ? Date.parse(doel.eindDatum) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(eind) || eind <= start) return null;
  const dagen = (eind - start) / 86_400_000;
  if (dagen >= 150 && dagen <= 200) return "half";
  if (dagen >= 330 && dagen <= 400) return "jaar";
  return null;
}

function kiesDoel(doelen: NieuwDashboardDoel[], soort: "half" | "jaar", nu: number): NieuwDashboardDoel | null {
  const passend = doelen.filter((doel) => classificeerDoel(doel) === soort && doel.actief !== false);
  const nuBinnen = passend.filter((doel) => {
    const start = Date.parse(doel.startDatum ?? "");
    const eind = Date.parse(doel.eindDatum ?? "");
    return Number.isFinite(start) && Number.isFinite(eind) && nu >= start && nu <= eind;
  });
  if (!nuBinnen.length) return null;
  return nuBinnen.sort((a, b) => Date.parse(b.startDatum ?? "") - Date.parse(a.startDatum ?? ""))[0] ?? null;
}

function maandenInDoel(startIso: string, eindIso: string): number {
  const start = kalenderVan(Date.parse(startIso));
  const eind = kalenderVan(Date.parse(eindIso));
  return Math.max(1, (eind.jaar - start.jaar) * 12 + (eind.maand - start.maand) + 1);
}

function naarDoelKaart(voortgang: SalesGoalProgress, factor: number): DoelKaart {
  const maanden = maandenInDoel(voortgang.startDatum, voortgang.eindDatum);
  const doelScholen = factor > 0 ? voortgang.doelLicenties / factor : 0;
  const tempoScholen = factor > 0 ? voortgang.verwachtOpTempoLicenties / factor : 0;
  const prognoseScholen = voortgang.forecastLicenties === null || factor <= 0 ? null : voortgang.forecastLicenties / factor;
  return {
    id: voortgang.id,
    naam: voortgang.naam,
    startDatum: voortgang.startDatum,
    eindDatum: voortgang.eindDatum,
    gerealiseerd: maat(voortgang.nieuweScholen, voortgang.gerealiseerdLicenties),
    doelLicenties: voortgang.doelLicenties,
    doelScholenIndicatie: doelScholen,
    percentageLicenties: voortgang.percentageBehaald,
    percentageScholen: doelScholen > 0 ? (voortgang.nieuweScholen / doelScholen) * 100 : 0,
    tempoLicenties: voortgang.verwachtOpTempoLicenties,
    tempoScholen,
    verschilLicenties: voortgang.verschilTovTempoLicenties,
    verschilScholen: voortgang.nieuweScholen - tempoScholen,
    status: voortgang.status,
    prognoseLicenties: voortgang.forecastLicenties,
    prognoseScholen,
    periodeVerstrekenPercentage: voortgang.periodeVerstrekenPercentage,
    maandDoelLicenties: voortgang.doelLicenties / maanden,
    maandDoelScholen: doelScholen / maanden,
  };
}

function legeFunnel(): FunnelStand {
  return { lead: maat(), prospect: maat(), wacht: maat(), klant: maat(), gestopt: maat(), inactief: maat(), overig: maat() };
}

function legeTypeRij(naam: string): TypeRij {
  return { naam, lead: maat(), prospect: maat(), wacht: maat(), klant: maat(), gestopt: maat(), inactief: maat(), overig: maat(), potentie: maat() };
}

function statusVeld(status: ReturnType<typeof canonStatus>): keyof FunnelStand {
  if (status === "Lead") return "lead";
  if (status === "Prospect") return "prospect";
  if (status === "Wacht op handtekening") return "wacht";
  if (status === "Klant") return "klant";
  if (status === "Gestopt") return "gestopt";
  if (status === "Inactief") return "inactief";
  return "overig";
}

function tel(rij: Maat, licenties: number) {
  rij.scholen += 1;
  rij.licenties += licenties;
}

function kwaliteitTekst(zonderDatum: number, compleet: boolean): string {
  const delen: string[] = [];
  if (!compleet) delen.push("De statushistorie is zo lang dat niet alles is ingelezen.");
  if (zonderDatum === 1) delen.push("1 huidige klant heeft geen klant-datum en telt niet mee in de maanden of halfjaren.");
  else if (zonderDatum > 1) delen.push(`${zonderDatum} huidige klanten hebben geen klant-datum en tellen niet mee in de maanden of halfjaren.`);
  if (zonderDatum > 0) delen.push("Het verschil met de Monday-stand staat op de regel Correctie / onbekend.");
  return delen.join(" ");
}

type Canon = ReturnType<typeof canonStatus>;

function isPipelineStatus(status: Canon): boolean {
  return status === "Lead" || status === "Prospect" || status === "Wacht op handtekening";
}

interface Stam {
  klant: boolean;
  pipeline: boolean;
  niveau: number | null;
}

interface KlantStroom { erbij: Maat; eraf: Maat; erbijScholen: SchoolRegel[]; erafScholen: SchoolRegel[] }
interface PipelineStroom { nieuw: Maat; klantGeworden: Maat; afgevallen: Maat; nieuwScholen: SchoolRegel[]; klantGewordenScholen: SchoolRegel[]; afgevallenScholen: SchoolRegel[] }

function legeKlantStroom(): KlantStroom { return { erbij: maat(), eraf: maat(), erbijScholen: [], erafScholen: [] }; }
function legePipelineStroom(): PipelineStroom { return { nieuw: maat(), klantGeworden: maat(), afgevallen: maat(), nieuwScholen: [], klantGewordenScholen: [], afgevallenScholen: [] }; }

function telOp(doel: Maat, scholen: number, licenties: number, lijst?: SchoolRegel[], naam?: string) {
  if (scholen === 0 && licenties === 0) return;
  doel.scholen += scholen;
  doel.licenties += licenties;
  if (lijst && naam) lijst.push({ naam, scholen, licenties });
}

interface Gebeurtenis {
  op: number;
  soort: "status" | "licentie";
  vanStatus: Canon | null;
  naarStatus: Canon | null;
  vanLicentie: number | null;
  naarLicentie: number | null;
}

function gebeurtenissenVan(school: NieuwDashboardSchool, historie: NieuwDashboardHistorie[]): Gebeurtenis[] {
  const lijst: Gebeurtenis[] = [];
  let heeftStatus = false;
  for (const event of historie) {
    if (event.mondayItemId !== school.id) continue;
    const op = Date.parse(event.occurredAt);
    if (!Number.isFinite(op)) continue;
    if (event.columnId === SCHOLEN_KOLOM.relatiestatus) {
      heeftStatus = true;
      const vorige = event.previousValue == null || String(event.previousValue).trim() === "" ? null : canonStatus(String(event.previousValue));
      lijst.push({ op, soort: "status", vanStatus: vorige, naarStatus: canonStatus(String(event.value ?? "")), vanLicentie: null, naarLicentie: null });
    } else if (event.columnId === SCHOLEN_KOLOM.aantalLeerlingen || event.soort === "licenties") {
      lijst.push({ op, soort: "licentie", vanStatus: null, naarStatus: null, vanLicentie: historischNummer(event.previousValue), naarLicentie: historischNummer(event.value) });
    }
  }
  lijst.sort((a, b) => a.op - b.op || (a.soort === "licentie" ? -1 : 1));
  if (!heeftStatus && school.aangemaaktOp && isPipelineStatus(canonStatus(school.relatiestatus))) {
    const op = Date.parse(school.aangemaaktOp);
    if (Number.isFinite(op)) {
      lijst.unshift({ op, soort: "status", vanStatus: null, naarStatus: canonStatus(school.relatiestatus), vanLicentie: null, naarLicentie: null });
    }
  }
  return lijst;
}

function niveauVoor(events: Gebeurtenis[], op: number, fallback: number): number {
  const voor = events.filter((event) => event.soort === "licentie" && event.op <= op && event.naarLicentie != null);
  const laatste = voor[voor.length - 1];
  if (laatste?.naarLicentie != null) return laatste.naarLicentie;
  const na = events.find((event) => event.soort === "licentie" && event.op > op && event.vanLicentie != null);
  if (na?.vanLicentie != null) return na.vanLicentie;
  return fallback;
}

function pasLicentieToe(staat: Stam, van: number | null, naar: number | null, klant: KlantStroom, pipeline: PipelineStroom, naam: string) {
  const basis = van ?? staat.niveau;
  if (naar != null && basis != null) {
    const delta = naar - basis;
    if (staat.klant && delta > 0) telOp(klant.erbij, 0, delta, klant.erbijScholen, naam);
    if (staat.klant && delta < 0) telOp(klant.eraf, 0, -delta, klant.erafScholen, naam);
    if (staat.pipeline && delta > 0) telOp(pipeline.nieuw, 0, delta, pipeline.nieuwScholen, naam);
    if (staat.pipeline && delta < 0) telOp(pipeline.afgevallen, 0, -delta, pipeline.afgevallenScholen, naam);
  }
  if (naar != null) staat.niveau = naar;
}

function pasStatusToe(staat: Stam, van: Canon | null, naar: Canon, niveau: number, klant: KlantStroom, pipeline: PipelineStroom, dun: { waarde: boolean }, naam: string) {
  if (staat.niveau == null) staat.niveau = niveau;
  const niveauNu = staat.niveau ?? niveau;
  const vanPipeline = staat.pipeline;
  const vanKlant = staat.klant;
  if (!vanPipeline && van && isPipelineStatus(van)) dun.waarde = true;

  if (isPipelineStatus(naar)) {
    if (!vanPipeline) telOp(pipeline.nieuw, 1, niveauNu, pipeline.nieuwScholen, naam);
    staat.pipeline = true;
    if (vanKlant) {
      telOp(klant.eraf, 1, niveauNu, klant.erafScholen, naam);
      staat.klant = false;
    }
    return;
  }
  if (naar === "Klant") {
    if (!vanKlant) telOp(klant.erbij, 1, niveauNu, klant.erbijScholen, naam);
    staat.klant = true;
    if (vanPipeline) {
      telOp(pipeline.klantGeworden, 1, niveauNu, pipeline.klantGewordenScholen, naam);
      staat.pipeline = false;
    }
    return;
  }
  if (vanPipeline) telOp(pipeline.afgevallen, 1, niveauNu, pipeline.afgevallenScholen, naam);
  staat.pipeline = false;
  if (vanKlant) telOp(klant.eraf, 1, niveauNu, klant.erafScholen, naam);
  staat.klant = false;
}

function voorraad(staat: Stam): { klant: Maat; pipeline: Maat } {
  const niveau = staat.niveau ?? 0;
  return {
    klant: staat.klant ? maat(1, niveau) : maat(),
    pipeline: staat.pipeline ? maat(1, niveau) : maat(),
  };
}

export function bouwNieuwDashboard(input: {
  scholen: NieuwDashboardSchool[];
  historie: NieuwDashboardHistorie[];
  doelen: NieuwDashboardDoel[];
  nu: number;
  factor: number;
  historieCompleet?: boolean;
  bijgewerktOp?: string;
}): NieuwDashboardModel {
  const factor = input.factor > 0 ? input.factor : 200;
  const tijden = bepaalTijden(input.scholen, input.historie);
  const funnel = legeFunnel();
  const typen = new Map<string, TypeRij>();
  const bronnen = new Map<string, BronRij>();
  const klanten = maat();
  const pipeline = maat();
  let zonderDatum = 0;

  for (const school of input.scholen) {
    const status = canonStatus(school.relatiestatus);
    const licenties = Number.isFinite(school.licenties) ? school.licenties : 0;
    const veld = statusVeld(status);
    tel(funnel[veld], licenties);
    const open = isPipelineStatus(status);
    if (status === "Klant") tel(klanten, licenties);
    if (open) tel(pipeline, licenties);

    const typeNaam = bucket(school.onderwijstypen);
    const typeRij = typen.get(typeNaam) ?? legeTypeRij(typeNaam);
    tel(typeRij[veld], licenties);
    if (open) tel(typeRij.potentie, licenties);
    typen.set(typeNaam, typeRij);

    const bronNaam = bucket(school.bronnen);
    const bronRij = bronnen.get(bronNaam) ?? { naam: bronNaam, klanten: maat(), pipeline: maat() };
    if (status === "Klant") tel(bronRij.klanten, licenties);
    if (open) tel(bronRij.pipeline, licenties);
    bronnen.set(bronNaam, bronRij);

    if (status === "Klant" && !tijden.get(school.id)?.eersteKlantOp) zonderDatum += 1;
  }

  const maandSleutels = laatsteMaanden(input.nu);
  const vensterStart = (() => {
    const eerste = maandSleutels[0];
    const match = eerste ? /^(\d{4})-(\d{2})$/.exec(eerste) : null;
    return match ? middernachtAmsterdam(Number(match[1]), Number(match[2]), 1) : input.nu;
  })();
  const klantStromen = new Map<string, KlantStroom>();
  const pipelineStromen = new Map<string, PipelineStroom>();
  let klantBegin = maat();
  let pipelineBegin = maat();
  let pipelineHistorieDun = false;
  const eindToestand = new Map<string, Stam>();

  for (const school of input.scholen) {
    const events = gebeurtenissenVan(school, input.historie).filter((event) => event.op <= input.nu);
    const voorVenster: Stam = { klant: false, pipeline: false, niveau: null };
    const dun = { waarde: false };
    const pasToe = (staat: Stam, event: Gebeurtenis, klantStroom: KlantStroom, pipelineStroom: PipelineStroom) => {
      if (event.soort === "licentie") {
        pasLicentieToe(staat, event.vanLicentie, event.naarLicentie, klantStroom, pipelineStroom, school.naam?.trim() || school.id);
        return;
      }
      if (!event.naarStatus) return;
      pasStatusToe(staat, event.vanStatus, event.naarStatus, niveauVoor(events, event.op, school.licenties), klantStroom, pipelineStroom, dun, school.naam?.trim() || school.id);
    };
    for (const event of events) {
      if (event.op >= vensterStart) break;
      pasToe(voorVenster, event, legeKlantStroom(), legePipelineStroom());
    }
    const begin = voorraad(voorVenster);
    klantBegin = plus(klantBegin, begin.klant);
    pipelineBegin = plus(pipelineBegin, begin.pipeline);

    const staat: Stam = { klant: voorVenster.klant, pipeline: voorVenster.pipeline, niveau: voorVenster.niveau };
    for (const event of events) {
      if (event.op < vensterStart) continue;
      const sleutel = maandSleutel(event.op);
      if (!maandSleutels.includes(sleutel)) continue;
      const klantStroom = klantStromen.get(sleutel) ?? legeKlantStroom();
      const pipelineStroom = pipelineStromen.get(sleutel) ?? legePipelineStroom();
      klantStromen.set(sleutel, klantStroom);
      pipelineStromen.set(sleutel, pipelineStroom);
      pasToe(staat, event, klantStroom, pipelineStroom);
    }
    if (dun.waarde) pipelineHistorieDun = true;
    eindToestand.set(school.id, staat);
  }

  const huidigeSleutel = maandSleutel(input.nu);
  let klantStand = klantBegin;
  let pipelineStand = pipelineBegin;
  const maanden: MaandRij[] = maandSleutels.map((sleutel) => {
    const stroom = klantStromen.get(sleutel) ?? legeKlantStroom();
    const netto = minMaat(stroom.erbij, stroom.eraf);
    klantStand = plus(klantStand, netto);
    const { jaar, half } = kalenderVan(eindeVanMaand(sleutel));
    return {
      sleutel,
      label: maandLabel(sleutel),
      jaar,
      half,
      erbij: stroom.erbij,
      eraf: stroom.eraf,
      netto,
      eindstand: { ...klantStand },
      erbijScholen: stroom.erbijScholen,
      erafScholen: stroom.erafScholen,
      isNu: sleutel === huidigeSleutel,
      correctie: false,
    };
  });
  const klantGap = minMaat(klanten, klantStand);
  const correctieErbij: SchoolRegel[] = [];
  const correctieEraf: SchoolRegel[] = [];
  const correctieNieuw: SchoolRegel[] = [];
  const correctieKlant: SchoolRegel[] = [];
  const correctieAfgevallen: SchoolRegel[] = [];
  for (const school of input.scholen) {
    const staat = eindToestand.get(school.id) ?? { klant: false, pipeline: false, niveau: null };
    const naam = school.naam?.trim() || school.id;
    const status = canonStatus(school.relatiestatus);
    const liveKlant = status === "Klant";
    const livePipeline = isPipelineStatus(status);
    const historisch = staat.niveau ?? 0;
    if (liveKlant && !staat.klant) telOp(maat(), 1, school.licenties, correctieErbij, naam);
    else if (!liveKlant && staat.klant) telOp(maat(), 1, historisch, correctieEraf, naam);
    else if (liveKlant && staat.klant && school.licenties !== historisch) {
      const delta = school.licenties - historisch;
      if (delta > 0) telOp(maat(), 0, delta, correctieErbij, naam);
      else telOp(maat(), 0, -delta, correctieEraf, naam);
    }
    if (livePipeline && !staat.pipeline) telOp(maat(), 1, school.licenties, correctieNieuw, naam);
    else if (!livePipeline && staat.pipeline && liveKlant) telOp(maat(), 1, historisch, correctieKlant, naam);
    else if (!livePipeline && staat.pipeline) telOp(maat(), 1, historisch, correctieAfgevallen, naam);
    else if (livePipeline && staat.pipeline && school.licenties !== historisch) {
      const delta = school.licenties - historisch;
      if (delta > 0) telOp(maat(), 0, delta, correctieNieuw, naam);
      else telOp(maat(), 0, -delta, correctieAfgevallen, naam);
    }
  }
  if (klantGap.scholen !== 0 || klantGap.licenties !== 0) {
    maanden.push({
      sleutel: "correctie",
      label: "Correctie / onbekend",
      jaar: kalenderVan(input.nu).jaar,
      half: kalenderVan(input.nu).half,
      erbij: maat(Math.max(0, klantGap.scholen), Math.max(0, klantGap.licenties)),
      eraf: maat(Math.max(0, -klantGap.scholen), Math.max(0, -klantGap.licenties)),
      netto: klantGap,
      eindstand: { ...klanten },
      erbijScholen: correctieErbij,
      erafScholen: correctieEraf,
      isNu: false,
      correctie: true,
    });
  }

  const pipelineMaanden: PipelineMaandRij[] = maandSleutels.map((sleutel) => {
    const stroom = pipelineStromen.get(sleutel) ?? legePipelineStroom();
    const netto = minMaat(stroom.nieuw, plus(stroom.klantGeworden, stroom.afgevallen));
    pipelineStand = plus(pipelineStand, netto);
    return {
      sleutel,
      label: maandLabel(sleutel),
      nieuw: stroom.nieuw,
      klantGeworden: stroom.klantGeworden,
      afgevallen: stroom.afgevallen,
      netto,
      eindstand: { ...pipelineStand },
      nieuwScholen: stroom.nieuwScholen,
      klantGewordenScholen: stroom.klantGewordenScholen,
      afgevallenScholen: stroom.afgevallenScholen,
      isNu: sleutel === huidigeSleutel,
      correctie: false,
    };
  });
  const pipelineGap = minMaat(pipeline, pipelineStand);
  if (pipelineGap.scholen !== 0 || pipelineGap.licenties !== 0) {
    pipelineMaanden.push({
      sleutel: "correctie",
      label: "Correctie / onbekend",
      nieuw: maat(Math.max(0, pipelineGap.scholen), Math.max(0, pipelineGap.licenties)),
      klantGeworden: maat(),
      afgevallen: maat(Math.max(0, -pipelineGap.scholen), Math.max(0, -pipelineGap.licenties)),
      netto: pipelineGap,
      eindstand: { ...pipeline },
      nieuwScholen: correctieNieuw,
      klantGewordenScholen: correctieKlant,
      afgevallenScholen: correctieAfgevallen,
      isNu: false,
      correctie: true,
    });
  }

  const dezeMaand = maanden.find((maand) => maand.isNu);
  const klantCorrectie = maanden.find((maand) => maand.correctie);
  const dezeMaandNetto = plus(dezeMaand?.netto ?? maat(), klantCorrectie?.netto ?? maat());
  const halfPeriode = kalenderPeriode(input.nu, "half");
  const jaarPeriode = kalenderPeriode(input.nu, "jaar");
  const nieuwIn = (start: number, eind: number) => {
    const som = maat();
    for (const tijd of tijden.values()) {
      if (tijd.eersteKlantOp === null || tijd.eersteKlantOp < start || tijd.eersteKlantOp > eind) continue;
      tel(som, tijd.licentiesBijKlant);
    }
    return som;
  };

  const halfjaren: HalfjaarRij[] = halvesSinds2026(input.nu).map((half) => {
    const nieuw = maat();
    for (const school of input.scholen) {
      const kolom = parseHalfjaarLabel(school.klantGeworden);
      if (!kolom || kolom.half == null || kolom.jaar !== half.jaar || kolom.half !== half.half || kolom.jaar < 2026) continue;
      tel(nieuw, Number.isFinite(school.licenties) ? school.licenties : 0);
    }
    return { ...half, nieuw };
  });

  const wins = [...tijden.entries()]
    .filter((entry): entry is [string, SchoolTijd & { eersteKlantOp: number }] => entry[1].eersteKlantOp !== null)
    .map(([, tijd]) => ({ occurredAt: tijd.eersteKlantOp, licenses: tijd.licentiesBijKlant }));

  const doelKaart = (soort: "half" | "jaar") => {
    const doel = kiesDoel(input.doelen, soort, input.nu);
    if (!doel) return null;
    const voortgang = calculateSalesGoalProgress(doel as SalesGoalInput, wins, factor, input.nu);
    return voortgang ? naarDoelKaart(voortgang, factor) : null;
  };

  const sorteerNaam = (naam: string) => (naam === "Onbekend" ? 2 : naam === "Meerdere" ? 1 : 0);
  const typenLijst = [...typen.values()].sort((a, b) => sorteerNaam(a.naam) - sorteerNaam(b.naam) || b.klant.licenties - a.klant.licenties || a.naam.localeCompare(b.naam, "nl"));
  const bronnenLijst = [...bronnen.values()].sort((a, b) => sorteerNaam(a.naam) - sorteerNaam(b.naam) || b.klanten.licenties - a.klanten.licenties || a.naam.localeCompare(b.naam, "nl"));

  return {
    bijgewerktOp: input.bijgewerktOp ?? new Date(input.nu).toISOString(),
    factor,
    gemLicentiesPerKlant: klanten.scholen > 0 ? klanten.licenties / klanten.scholen : null,
    periodeLabels: { half: halfPeriode.label, jaar: jaarPeriode.label },
    klanten,
    pipeline,
    dezeMaandNetto,
    nieuwInPeriode: { half: nieuwIn(halfPeriode.start, halfPeriode.eind), jaar: nieuwIn(jaarPeriode.start, jaarPeriode.eind) },
    doelen: { half: doelKaart("half"), jaar: doelKaart("jaar") },
    maanden,
    pipelineMaanden,
    pipelineHistorieDun,
    funnel,
    typen: typenLijst,
    halfjaren,
    bronnen: bronnenLijst,
    kwaliteitTekst: kwaliteitTekst(zonderDatum, input.historieCompleet !== false),
  };
}
