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
 * naar Klant): die heeft een tijdstip. De Monday-kolom "Klant geworden" is een
 * label, geen datum. Alleen als de historie geen tijdstip heeft én het label
 * een halfjaar is, tonen we die school apart als "zonder maand". Een jaartal
 * of een onbekend label wordt niet in een halfjaar gegokt.
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

export interface MaandRij {
  sleutel: string;
  label: string;
  jaar: number;
  half: 1 | 2;
  nieuw: Maat;
  verschil: Maat;
  eindstand: Maat;
  isNu: boolean;
}

export interface HalfjaarRij {
  label: string;
  jaar: number;
  half: 1 | 2;
  nieuw: Maat;
  zonderMaand: Maat;
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
  dezeMaandNieuw: Maat;
  nieuwInPeriode: { half: Maat; jaar: Maat };
  doelen: { half: DoelKaart | null; jaar: DoelKaart | null };
  maanden: MaandRij[];
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

function laatsteHalves(nu: number): { jaar: number; half: 1 | 2; label: string; lopend: boolean }[] {
  const huidig = kalenderVan(nu);
  const uit: { jaar: number; half: 1 | 2; label: string; lopend: boolean }[] = [];
  let jaar = huidig.jaar;
  let half = huidig.half;
  for (let i = 0; i < 4; i++) {
    uit.unshift({ jaar, half, label: `H${half} ${jaar}`, lopend: i === 0 });
    if (half === 1) { half = 2; jaar -= 1; }
    else half = 1;
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

function isKlantTekst(raw: string | number | null | undefined): boolean {
  return String(raw ?? "").trim().toLowerCase() === "klant";
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

function inVoorraad(einde: number, nuKlant: boolean, tijd: SchoolTijd | undefined): boolean {
  if (!tijd?.eersteKlantOp || tijd.eersteKlantOp > einde) return false;
  if (nuKlant) return true;
  return tijd.vertrekOp !== null && tijd.vertrekOp > einde;
}

function kwaliteitTekst(zonderDatum: number, viaLabel: number, labelNietHerkend: number, compleet: boolean): string {
  const delen: string[] = [];
  if (!compleet) delen.push("De statushistorie is zo lang dat niet alles is ingelezen.");
  if (zonderDatum > 0) delen.push(`${zonderDatum} huidige klanten hebben geen klant-datum in de historie en zitten alleen in de stand van nu.`);
  if (viaLabel === 1) delen.push("1 daarvan staat bij een halfjaar via het Monday-label, zonder maand.");
  else if (viaLabel > 1) delen.push(`${viaLabel} daarvan staan bij een halfjaar via het Monday-label, zonder maand.`);
  if (labelNietHerkend === 1) delen.push("1 Monday-label is geen halfjaar en is niet in een halfjaar gezet.");
  else if (labelNietHerkend > 1) delen.push(`${labelNietHerkend} Monday-labels zijn geen halfjaar en zijn niet in een halfjaar gezet.`);
  return delen.join(" ");
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
  let viaLabel = 0;
  let labelNietHerkend = 0;
  const labelPerSchool = new Map<string, { jaar: number; half: 1 | 2 }>();

  for (const school of input.scholen) {
    const status = canonStatus(school.relatiestatus);
    const licenties = Number.isFinite(school.licenties) ? school.licenties : 0;
    const veld = statusVeld(status);
    tel(funnel[veld], licenties);
    const open = status === "Lead" || status === "Prospect" || status === "Wacht op handtekening";
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

    if (status === "Klant" && !tijden.get(school.id)?.eersteKlantOp) {
      zonderDatum += 1;
      const label = parseHalfjaarLabel(school.klantGeworden);
      if (label && label.half) {
        viaLabel += 1;
        labelPerSchool.set(school.id, { jaar: label.jaar, half: label.half });
      } else if (school.klantGeworden?.trim()) {
        labelNietHerkend += 1;
      }
    }
  }

  const nieuwPerMaand = new Map<string, Maat>();
  for (const tijd of tijden.values()) {
    if (tijd.eersteKlantOp === null) continue;
    const sleutel = maandSleutel(tijd.eersteKlantOp);
    const bestaand = nieuwPerMaand.get(sleutel) ?? maat();
    tel(bestaand, tijd.licentiesBijKlant);
    nieuwPerMaand.set(sleutel, bestaand);
  }

  const maandSleutels = laatsteMaanden(input.nu);
  const maandVoorVenster = (() => {
    const eerste = maandSleutels[0] ?? maandSleutel(input.nu);
    const match = /^(\d{4})-(\d{2})$/.exec(eerste);
    if (!match) return "";
    const totaal = Number(match[1]) * 12 + (Number(match[2]) - 1) - 1;
    return `${Math.floor(totaal / 12)}-${String((totaal % 12) + 1).padStart(2, "0")}`;
  })();
  let vorigeNieuw = nieuwPerMaand.get(maandVoorVenster) ?? maat();
  const huidigeSleutel = maandSleutel(input.nu);
  const maanden: MaandRij[] = maandSleutels.map((sleutel) => {
    const nieuw = nieuwPerMaand.get(sleutel) ?? maat();
    const verschil = maat(nieuw.scholen - vorigeNieuw.scholen, nieuw.licenties - vorigeNieuw.licenties);
    vorigeNieuw = nieuw;
    const isNu = sleutel === huidigeSleutel;
    const { jaar, half } = kalenderVan(eindeVanMaand(sleutel));
    const einde = eindeVanMaand(sleutel);
    const eindstand = maat();
    if (isNu) {
      eindstand.scholen = klanten.scholen;
      eindstand.licenties = klanten.licenties;
    } else {
      for (const school of input.scholen) {
        const nuKlant = canonStatus(school.relatiestatus) === "Klant";
        const tijd = tijden.get(school.id);
        if (!inVoorraad(einde, nuKlant, tijd)) continue;
        tel(eindstand, tijd?.licentiesBijKlant ?? school.licenties);
      }
    }
    return { sleutel, label: maandLabel(sleutel), jaar, half, nieuw, verschil, eindstand, isNu };
  });

  const dezeMaandNieuw = maanden.find((maand) => maand.isNu)?.nieuw ?? maat();
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

  const halfjaren: HalfjaarRij[] = laatsteHalves(input.nu).map((half) => {
    const start = half.half === 1 ? middernachtAmsterdam(half.jaar, 1, 1) : middernachtAmsterdam(half.jaar, 7, 1);
    const eind = half.half === 1 ? middernachtAmsterdam(half.jaar, 7, 1) - 1 : middernachtAmsterdam(half.jaar + 1, 1, 1) - 1;
    const zonderMaand = maat();
    for (const school of input.scholen) {
      const label = labelPerSchool.get(school.id);
      if (!label || label.jaar !== half.jaar || label.half !== half.half) continue;
      tel(zonderMaand, school.licenties);
    }
    return { ...half, nieuw: nieuwIn(start, eind), zonderMaand };
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
    dezeMaandNieuw,
    nieuwInPeriode: { half: nieuwIn(halfPeriode.start, halfPeriode.eind), jaar: nieuwIn(jaarPeriode.start, jaarPeriode.eind) },
    doelen: { half: doelKaart("half"), jaar: doelKaart("jaar") },
    maanden,
    funnel,
    typen: typenLijst,
    halfjaren,
    bronnen: bronnenLijst,
    kwaliteitTekst: kwaliteitTekst(zonderDatum, viaLabel, labelNietHerkend, input.historieCompleet !== false),
  };
}
