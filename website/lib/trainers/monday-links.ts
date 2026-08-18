import { mondayQuery, haalScholenPagina, haalUpdatesVoorItem, type MondayColumnValue, type MondayUpdate } from "@/lib/sales/monday-client";
import type { AuthTrainer } from "./auth";

/**
 * "Vandaag" voor het dashboard — BEWUST een eigen, tijdzone-expliciete
 * implementatie, geen hergebruik van lib/sales/format-datum.ts se
 * vandaagIso(). Die functie leest `new Date().getFullYear()/getMonth()/
 * getDate()` — correct voor code die in de BROWSER draait (haar eigen
 * toelichting: "dat IS de tijdzone van de gebruiker"), maar dit bestand
 * draait uitsluitend server-side (rechtstreekse Monday-API-aanroepen).
 * Vercel-functions draaien standaard in UTC, niet in Europe/Amsterdam — bij
 * hergebruik van vandaagIso() hier zou "trainingenVandaag" rond middernacht
 * NL-tijd hetzelfde soort tijdzonebug reproduceren die vandaagIso() ooit zelf
 * repareerde (zie het commentaar daar), alleen nu UTC-vs-NL i.p.v. UTC-vs-
 * browser. Intl.DateTimeFormat met een expliciete timeZone verwerkt
 * CET/CEST (zomertijd) automatisch correct, ongeacht de servers eigen
 * tijdzone-instelling — "en-CA" geeft rechtstreeks een YYYY-MM-DD-string.
 * Bewust NIET in format-datum.ts zelf aangepast: dat bestand wordt ook door
 * Sales gebruikt (buiten deze opdracht se scope) en mag niet wijzigen.
 */
function vandaagIsoAmsterdam(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

// Traineromgeving V1, Ronde 1 (2026-08-19) — de resolutieladder uit
// architectuurrapport §1/§3/§4/§5/§6, 100% read-only. Hergebruikt
// mondayQuery/haalScholenPagina/haalUpdatesVoorItem (lib/sales/monday-
// client.ts) — geen eigen kopie van de Monday-clientlaag. Importeert BEWUST
// niets uit lib/trainers-diagnose/: dat is een tijdelijke, voor verwijdering
// geplande module; dit bestand is permanente V1-infrastructuur en moet
// onafhankelijk van die levenscyclus blijven werken.
//
// Board-/kolom-ID's — LIVE GEVERIFIEERD (Michels live Monday-diagnose,
// architectuurrapport §A) — nooit wijzigen zonder herbevestiging tegen een
// echt board via /admin/trainers-diagnose/monday.
const MASTER_DATA_BOARD_ID = "18420120365"; // 1: Scholen (Master Data)
const UITVOERING_BOARD_ID = "18420120466"; // 4: Uitvoering (Trainingen)

const MD_TRAINER_KOLOM = "board_relation_mm5r2jy1";
const MD_HOOFDCONTACTPERSOON_KOLOM = "board_relation_mm4v8fpm";
const MD_TYPE_SCHOOL_KOLOM = "dropdown_mm4v9rvg";
const MD_LOCATION_KOLOM = "text_mm5r9kn2";
const MD_IMPLEMENTATIEFASE_KOLOM = "color_mm5q790a";

const UV_SCHOOL_KOLOM = "board_relation_mm5tyc40";
const UV_STATUS_KOLOM = "color_mm5tz3wk";
const UV_DATUM_KOLOM = "date_mm5tnfvx";
const UV_LOGBOEK_KOLOM = "boolean_mm5tvfc5";

const TB_MASTER_ID_KOLOM = "numeric_mm5vceeq";

// Begrenzingen — zelfde "nooit onbegrensd tegen het gedeelde Monday-
// ratebudget"-principe als lib/trainers-diagnose/monday-readonly.ts. Bij
// overschrijding ontbreken silently scholen/trainingen buiten de eerste
// pagina — geaccepteerde, expliciet gedocumenteerde V1-beperking (geen
// meerpagina-doorloop in Ronde 1).
const MAX_MASTER_DATA_ITEMS = 250;
const MAX_UITVOERING_ITEMS = 500;
const MAX_TRAINERBOARD_ITEMS = 100;
const MAX_SCHOOL_UPDATES = 30;

function naarKolomMap(columnValues: MondayColumnValue[]): Map<string, MondayColumnValue> {
  return new Map(columnValues.map((cv) => [cv.id, cv]));
}

/**
 * Board_relation-kolomwaarden bevatten de gekoppelde item-ID('s) als
 * linkedPulseIds — live bevestigd (zie haalItemDetail-tests in
 * lib/trainers-diagnose/monday-readonly.ts, dezelfde JSON-vorm). Geeft
 * nooit een fout, alleen een lege lijst bij ontbrekende/kapotte data.
 */
export function parseLinkedPulseIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { linkedPulseIds?: { linkedPulseId: number }[] };
    return (parsed.linkedPulseIds ?? []).map((l) => String(l.linkedPulseId));
  } catch {
    return [];
  }
}

/**
 * Checkbox-kolomwaarde — general platform knowledge (Monday's checkbox-
 * kolom bewaart `{"checked":"true"}` in value bij aangevinkt, leeg/null
 * anders), nog niet live tegen boolean_mm5tvfc5 zelf bevestigd. Geeft
 * bewust `false` terug bij elke onzekerheid (ontbrekend/kapot) — de hele
 * functie van dit veld is "logboek nog niet ingevuld" zichtbaar maken, dus
 * bij twijfel is "nog niet ingevuld" de veilige aanname, nooit het
 * omgekeerde.
 */
export function parseCheckboxIngevuld(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as { checked?: string | boolean };
    return parsed.checked === "true" || parsed.checked === true;
  } catch {
    return false;
  }
}

const ISO_DATUM_PREFIX = /^\d{4}-\d{2}-\d{2}/;
/** Monday's date-kolom text-veld — algemene platformkennis (YYYY-MM-DD-vorm), nog niet live tegen dit specifieke veld bevestigd. Geeft null terug i.p.v. te gokken bij een onverwachte vorm. */
export function parseMondayDatum(tekst: string | null | undefined): string | null {
  if (!tekst) return null;
  const match = tekst.match(ISO_DATUM_PREFIX);
  return match ? match[0] : null;
}

/**
 * Root-cause-fix (2026-08-19, Wessel se 12 niet-hard-gekoppelde scholen):
 * numeric_mm5vceeq ("Master ID" op het trainerboard) is een Monday
 * "Numbers"-kolom — general platform knowledge: zo'n kolom heeft een
 * optionele weergave-instelling voor een duizendtal-scheidingsteken
 * ("1,000"-stijl), die uitsluitend .text beïnvloedt (bv. "12,713,002,919"
 * i.p.v. "12713002919"), nooit .value. Deze functie werd voorheen uitgelezen
 * via .text (zie git-historie) en gebruikt vervolgens als EXACTE sleutel om
 * de centrale training op te zoeken (uitvoeringById.get(...), waar item-ID's
 * altijd schone cijferstrings zijn, nooit geformatteerd) — bij een
 * trainerboard waarvan deze kolom die scheidingsteken-instelling aan heeft
 * staan, faalde die exacte match dus stilzwijgend voor een overigens
 * volledig geldige Master ID → centrale training-koppeling: uitvoeringById.
 * get(tbItem.masterId) vond niets, en de code viel terug op de Tier 3
 * naam-heuristiek (of, als de groepnaam ambigu/onbekend was, op niets) —
 * exact het gerapporteerde symptoon (scholen wél zichtbaar onder "Mogelijk
 * ook van jou", nooit onder "Mijn scholen"). .value is Monday's ruwe,
 * ongeformatteerde JSON-getal (dezelfde conventie als parseLinkedPulseIds/
 * parseDoelboardIds hierboven, die om identieke reden ook altijd .value
 * gebruiken voor ID-vergelijkingen, nooit .text) en is dus de correcte bron
 * voor een exacte match. Valt terug op .text uitsluitend wanneer .value
 * ontbreekt/onparseerbaar is — dekt zowel oudere Monday-datavarianten die
 * (nog) geen numerieke value meesturen als de bestaande tests, die vóór deze
 * fix uitsluitend .text mockten.
 */
export function parseNumeriekeKolomAlsId(kolom: { text?: string | null; value?: string | null } | null | undefined): string | null {
  if (kolom?.value) {
    try {
      const parsed = JSON.parse(kolom.value) as number | string | null;
      if (parsed !== null && parsed !== undefined) {
        // Monday's Numbers-kolom kan een geheel getal als "12713002919.0"
        // teruggeven (bv. na een spreadsheet-plakactie) — een Monday-item-ID
        // is altijd een geheel getal, dus een ".0"-staart is hier ruis.
        const zonderNulDecimaal = String(parsed).trim().replace(/\.0+$/, "");
        if (/^\d+$/.test(zonderNulDecimaal)) return zonderNulDecimaal;
      }
    } catch {
      // Onverwachte vorm — val terug op .text hieronder.
    }
  }
  const tekst = kolom?.text?.trim();
  return tekst || null;
}

export type TrainingStatus = "open" | "gepland" | "gedaan" | "geannuleerd";

/**
 * Enige bron van waarheid: color_mm5tz3wk (centrale Status-kolom) —
 * architectuurrapport §6. Monday's workflowgroepen (Nieuw/Gepland/Gedaan/
 * Geannuleerd/Aangemaakt) worden hier bewust NIET gelezen: dat zou lezen
 * (hier) en schrijven (§7, dezelfde kolom) op twee verschillende bronnen
 * laten steunen. De exacte statuslabels zijn nog niet live opgesomd — dit
 * is dus een defensieve, tekst-bevattende (hoofdletterongevoelige)
 * afleiding, geen exacte match op een aangenomen labelset. Bij twijfel
 * valt dit terug op datumaanwezigheid, NOOIT stilzwijgend op "gedaan".
 */
export function bepaalTrainingStatus(statusTekst: string | null, datumIso: string | null): TrainingStatus {
  const tekst = (statusTekst ?? "").toLowerCase();
  if (tekst.includes("geannuleerd") || tekst.includes("cancel")) return "geannuleerd";
  if (tekst.includes("gedaan") || tekst.includes("afgerond") || tekst.includes("done")) return "gedaan";
  if (datumIso) return "gepland";
  return "open";
}

export interface TrainingSamenvatting {
  id: string;
  naam: string;
  status: TrainingStatus;
  ruweStatusTekst: string | null;
  datum: string | null;
  logboekIngevuld: boolean;
}

export interface TrainerSchoolBron {
  id: string;
  naam: string;
  onderwijstype: string | null;
  locatie: string | null;
  implementatiefase: string | null;
  contactpersoonNaam: string | null;
  /** Hoe deze school in de bevestigde lijst terechtkwam — intern/diagnostisch, geen trainer-facing onderscheid vereist. */
  bron: "trainer-relatie" | "training-koppeling";
}

export interface TrainerSchoolSuggestie {
  suggestieNaam: string;
  mogelijkeSchoolId: string;
  mogelijkeSchoolNaam: string;
}

interface MasterDataSchoolRuw {
  id: string;
  naam: string;
  onderwijstype: string | null;
  locatie: string | null;
  implementatiefase: string | null;
  contactpersoonNaam: string | null;
  trainerLinkedIds: string[];
}

interface TrainerboardItemRuw {
  id: string;
  naam: string;
  groupTitle: string | null;
  masterId: string | null;
}

async function haalTrainerboardStructuur(boardId: string, itemsLimit: number): Promise<{ items: TrainerboardItemRuw[] }> {
  const query = `
    query HaalTrainerboardStructuur($boardId: ID!, $itemsLimit: Int, $columnIds: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: $itemsLimit) {
          items {
            id
            name
            group { title }
            column_values(ids: $columnIds) { id text value }
          }
        }
      }
    }
  `;
  const data = await mondayQuery<{
    boards: {
      items_page: {
        items: { id: string; name: string; group: { title: string } | null; column_values: MondayColumnValue[] }[];
      };
    }[];
  }>(query, { boardId, itemsLimit, columnIds: [TB_MASTER_ID_KOLOM] });

  const items = data.boards[0]?.items_page.items ?? [];
  return {
    items: items.map((item) => {
      const kolommen = naarKolomMap(item.column_values);
      return {
        id: item.id,
        naam: item.name,
        groupTitle: item.group?.title ?? null,
        masterId: parseNumeriekeKolomAlsId(kolommen.get(TB_MASTER_ID_KOLOM)),
      };
    }),
  };
}

interface TrainerMondayContext {
  scholen: Map<string, TrainerSchoolBron>;
  trainingenPerSchool: Map<string, TrainingSamenvatting[]>;
  suggesties: TrainerSchoolSuggestie[];
}

/**
 * Verzamelt in maximaal 3 Monday-aanroepen (parallel) alles wat de
 * resolutieladder nodig heeft: Master Data (gefilterd op de Trainer-relatie
 * van déze trainer — tier 1), alle Uitvoering-trainingen gegroepeerd per
 * gekoppeld school-ID, en het eigen trainerboard (Master ID → tier 2/3).
 * Geen lokale cache tussen aanroepen — bewuste architectuurkeuze
 * (architectuurrapport §5/§12): elke paginalaad is een live Monday-read.
 */
async function verzamelTrainerContext(trainer: AuthTrainer): Promise<TrainerMondayContext> {
  const [masterDataPagina, uitvoeringPagina, trainerboardStructuur] = await Promise.all([
    haalScholenPagina({
      boardId: MASTER_DATA_BOARD_ID,
      columnIds: [MD_TRAINER_KOLOM, MD_HOOFDCONTACTPERSOON_KOLOM, MD_TYPE_SCHOOL_KOLOM, MD_LOCATION_KOLOM, MD_IMPLEMENTATIEFASE_KOLOM],
      limit: MAX_MASTER_DATA_ITEMS,
    }),
    haalScholenPagina({
      boardId: UITVOERING_BOARD_ID,
      columnIds: [UV_SCHOOL_KOLOM, UV_STATUS_KOLOM, UV_DATUM_KOLOM, UV_LOGBOEK_KOLOM],
      limit: MAX_UITVOERING_ITEMS,
    }),
    haalTrainerboardStructuur(trainer.mondayTrainerboardId, MAX_TRAINERBOARD_ITEMS),
  ]);

  const masterDataById = new Map<string, MasterDataSchoolRuw>();
  for (const item of masterDataPagina.items) {
    const kolommen = naarKolomMap(item.column_values);
    masterDataById.set(item.id, {
      id: item.id,
      naam: item.name,
      onderwijstype: kolommen.get(MD_TYPE_SCHOOL_KOLOM)?.text || null,
      locatie: kolommen.get(MD_LOCATION_KOLOM)?.text || null,
      implementatiefase: kolommen.get(MD_IMPLEMENTATIEFASE_KOLOM)?.text || null,
      contactpersoonNaam: kolommen.get(MD_HOOFDCONTACTPERSOON_KOLOM)?.text || null,
      trainerLinkedIds: parseLinkedPulseIds(kolommen.get(MD_TRAINER_KOLOM)?.value),
    });
  }

  const trainingenPerSchool = new Map<string, TrainingSamenvatting[]>();
  const uitvoeringById = new Map<string, { schoolIds: string[] }>();
  for (const item of uitvoeringPagina.items) {
    const kolommen = naarKolomMap(item.column_values);
    const schoolIds = parseLinkedPulseIds(kolommen.get(UV_SCHOOL_KOLOM)?.value);
    const datum = parseMondayDatum(kolommen.get(UV_DATUM_KOLOM)?.text);
    const statusTekst = kolommen.get(UV_STATUS_KOLOM)?.text ?? null;
    const samenvatting: TrainingSamenvatting = {
      id: item.id,
      naam: item.name,
      status: bepaalTrainingStatus(statusTekst, datum),
      ruweStatusTekst: statusTekst,
      datum,
      logboekIngevuld: parseCheckboxIngevuld(kolommen.get(UV_LOGBOEK_KOLOM)?.value),
    };
    uitvoeringById.set(item.id, { schoolIds });
    for (const schoolId of schoolIds) {
      const lijst = trainingenPerSchool.get(schoolId) ?? [];
      lijst.push(samenvatting);
      trainingenPerSchool.set(schoolId, lijst);
    }
  }

  // Tier 1 (autoritatief): Master Data.Trainer bevat het item-ID van déze trainer.
  const scholen = new Map<string, TrainerSchoolBron>();
  for (const school of masterDataById.values()) {
    if (school.trainerLinkedIds.includes(trainer.mondayUitvoerderItemId)) {
      scholen.set(school.id, {
        id: school.id,
        naam: school.naam,
        onderwijstype: school.onderwijstype,
        locatie: school.locatie,
        implementatiefase: school.implementatiefase,
        contactpersoonNaam: school.contactpersoonNaam,
        bron: "trainer-relatie",
      });
    }
  }

  // Tier 2/3: via het eigen trainerboard — Master ID → centrale training → School.
  const suggesties: TrainerSchoolSuggestie[] = [];
  for (const tbItem of trainerboardStructuur.items) {
    if (!tbItem.masterId) continue;
    const training = uitvoeringById.get(tbItem.masterId);
    if (!training) continue; // hangende/ongeldige Master ID — geen crash, gewoon overslaan

    if (training.schoolIds.length > 0) {
      for (const schoolId of training.schoolIds) {
        if (scholen.has(schoolId)) continue;
        const school = masterDataById.get(schoolId);
        if (!school) continue;
        scholen.set(schoolId, {
          id: school.id,
          naam: school.naam,
          onderwijstype: school.onderwijstype,
          locatie: school.locatie,
          implementatiefase: school.implementatiefase,
          contactpersoonNaam: school.contactpersoonNaam,
          bron: "training-koppeling",
        });
      }
      continue;
    }

    // Tier 3: School-kolom leeg op de centrale training (datakwaliteits-
    // bevinding, architectuurrapport §B) — read-only groepnaam-suggestie,
    // uitsluitend bij een unieke, exacte (hoofdletterongevoelige) naammatch.
    // Bij ambiguïteit (0 of 2+ kandidaten): geen suggestie, nooit gokken.
    if (!tbItem.groupTitle) continue;
    const groepNaamGenormaliseerd = tbItem.groupTitle.trim().toLowerCase();
    const kandidaten = Array.from(masterDataById.values()).filter((school) => school.naam.trim().toLowerCase() === groepNaamGenormaliseerd);
    if (kandidaten.length === 1 && !scholen.has(kandidaten[0]!.id) && !suggesties.some((s) => s.mogelijkeSchoolId === kandidaten[0]!.id)) {
      suggesties.push({ suggestieNaam: tbItem.groupTitle, mogelijkeSchoolId: kandidaten[0]!.id, mogelijkeSchoolNaam: kandidaten[0]!.naam });
    }
  }

  return { scholen, trainingenPerSchool, suggesties };
}

export interface TrainerSchoolSamenvatting extends TrainerSchoolBron {
  aantalOpen: number;
  aantalGepland: number;
  aantalGedaan: number;
  eerstvolgendeTraining: { datum: string; naam: string } | null;
}

function samenvattingVoorSchool(school: TrainerSchoolBron, trainingen: TrainingSamenvatting[]): TrainerSchoolSamenvatting {
  const open = trainingen.filter((t) => t.status === "open").length;
  const gepland = trainingen.filter((t) => t.status === "gepland");
  const gedaan = trainingen.filter((t) => t.status === "gedaan").length;
  const eerstvolgende = [...gepland].filter((t) => t.datum).sort((a, b) => a.datum!.localeCompare(b.datum!))[0];
  return {
    ...school,
    aantalOpen: open,
    aantalGepland: gepland.length,
    aantalGedaan: gedaan,
    eerstvolgendeTraining: eerstvolgende ? { datum: eerstvolgende.datum!, naam: eerstvolgende.naam } : null,
  };
}

export interface TrainerScholenResultaat {
  bevestigd: TrainerSchoolSamenvatting[];
  mogelijkGekoppeld: TrainerSchoolSuggestie[];
}

/** Architectuurrapport §5 — "Mijn scholen": bevestigd (tier 1+2) + apart, read-only, niet-klikbaar "mogelijk gekoppeld" (tier 3). */
export async function bepaalScholenVoorTrainer(trainer: AuthTrainer): Promise<TrainerScholenResultaat> {
  const context = await verzamelTrainerContext(trainer);
  const bevestigd = Array.from(context.scholen.values())
    .map((school) => samenvattingVoorSchool(school, context.trainingenPerSchool.get(school.id) ?? []))
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  return { bevestigd, mogelijkGekoppeld: context.suggesties };
}

export interface TrainingMetSchool extends TrainingSamenvatting {
  schoolId: string;
  schoolNaam: string;
}

export interface TrainerDashboardData {
  trainingenVandaag: TrainingMetSchool[];
  komendeTrainingen: TrainingMetSchool[];
  aantalScholen: number;
  logboekOpenstaand: TrainingMetSchool[];
}

/** Architectuurrapport §16 Ronde 1 — dashboard, uitsluitend read-only afgeleide informatie. Trainingen zonder datum worden nergens getoond (expliciete opdrachtseis). */
export async function haalDashboardData(trainer: AuthTrainer): Promise<TrainerDashboardData> {
  const context = await verzamelTrainerContext(trainer);
  const vandaag = vandaagIsoAmsterdam();

  const alleTrainingenMetSchool: TrainingMetSchool[] = [];
  for (const school of context.scholen.values()) {
    const trainingen = context.trainingenPerSchool.get(school.id) ?? [];
    for (const training of trainingen) {
      alleTrainingenMetSchool.push({ ...training, schoolId: school.id, schoolNaam: school.naam });
    }
  }

  const metDatumNietGeannuleerd = alleTrainingenMetSchool.filter((t) => t.datum !== null && t.status !== "geannuleerd");
  const trainingenVandaag = metDatumNietGeannuleerd.filter((t) => t.datum === vandaag);
  const komendeTrainingen = metDatumNietGeannuleerd.filter((t) => t.datum! > vandaag).sort((a, b) => a.datum!.localeCompare(b.datum!));

  // "Logboek ingevuld = false" voor trainingen uit het verleden — puur
  // datum+boolean, bewust NIET afhankelijk van de onzekerdere statuslabel-
  // afleiding (bepaalTrainingStatus) — zie architectuurrapport, dashboard §.
  const logboekOpenstaand = alleTrainingenMetSchool.filter(
    (t) => t.datum !== null && t.datum < vandaag && !t.logboekIngevuld && t.status !== "geannuleerd"
  );

  return { trainingenVandaag, komendeTrainingen, aantalScholen: context.scholen.size, logboekOpenstaand };
}

export interface SchoolDetail extends TrainerSchoolBron {
  trainingen: {
    open: TrainingSamenvatting[];
    gepland: TrainingSamenvatting[];
    gedaan: TrainingSamenvatting[];
    geannuleerd: TrainingSamenvatting[];
  };
  logboek: MondayUpdate[];
}

/**
 * Object-level autorisatie zit HIER: schoolId moet voorkomen in de
 * resolutieladder van déze specifieke trainer — anders null, ongeacht of
 * het school-ID op zich wel bestaat. Een trainer kan zo nooit het bestaan
 * van andermans school afleiden (404, geen 403 — zelfde privacy-patroon als
 * payload/access/roles.ts se ownRecordAccess).
 */
export async function haalSchoolDetail(trainer: AuthTrainer, schoolId: string): Promise<SchoolDetail | null> {
  const context = await verzamelTrainerContext(trainer);
  const school = context.scholen.get(schoolId);
  if (!school) return null;

  const trainingen = context.trainingenPerSchool.get(schoolId) ?? [];
  const logboek = await haalUpdatesVoorItem(schoolId, MAX_SCHOOL_UPDATES);

  return {
    ...school,
    trainingen: {
      open: trainingen.filter((t) => t.status === "open"),
      gepland: trainingen.filter((t) => t.status === "gepland").sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? "")),
      gedaan: trainingen.filter((t) => t.status === "gedaan"),
      geannuleerd: trainingen.filter((t) => t.status === "geannuleerd"),
    },
    logboek,
  };
}
