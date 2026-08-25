import { mondayQuery, haalScholenPagina, haalUpdatesVoorItem, type MondayColumnValue, type MondaySchoolItem, type MondayUpdate } from "@/lib/sales/monday-client";
import type { AuthTrainer } from "./auth";
import { groepeerOpWeergaveStatus, type TrainingWeergaveStatus } from "./training-weergave";
import { sorteerTrainingenAlfabetisch } from "./training-sortering";

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
export function vandaagIsoAmsterdam(): string {
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
// Ronde 2 (2026-08-19) — geëxporteerd (was privé): lib/trainers/monday-
// columns.ts/writeback.ts hebben het echte board-ID + de bestaande kolom-
// ID's nodig als schrijfdoel voor de centrale training. Zuiver additief (een
// export-keyword), geen enkele waarde of het leespad hier verandert.
export const UITVOERING_BOARD_ID = "18420120466"; // 4: Uitvoering (Trainingen)

const MD_TRAINER_KOLOM = "board_relation_mm5r2jy1";
const MD_HOOFDCONTACTPERSOON_KOLOM = "board_relation_mm4v8fpm";
const MD_TYPE_SCHOOL_KOLOM = "dropdown_mm4v9rvg";
const MD_LOCATION_KOLOM = "text_mm5r9kn2";
const MD_IMPLEMENTATIEFASE_KOLOM = "color_mm5q790a";

const UV_SCHOOL_KOLOM = "board_relation_mm5tyc40";
export const UV_STATUS_KOLOM = "color_mm5tz3wk";
export const UV_DATUM_KOLOM = "date_mm5tnfvx";
// Geëxporteerd (Ronde 3, 2026-08-24): lib/trainers/monday-columns.ts heeft
// deze kolom-ID nodig als schrijfdoel voor de logboek-afronding (zie
// writeback.ts se nieuwe "logboek"-veld). Zuiver additief, leespad hier
// ongewijzigd.
export const UV_LOGBOEK_KOLOM = "boolean_mm5tvfc5";

const TB_MASTER_ID_KOLOM = "numeric_mm5vceeq";

// Begrenzingen — zelfde "nooit onbegrensd tegen het gedeelde Monday-
// ratebudget"-principe als lib/trainers-diagnose/monday-readonly.ts. Elke
// waarde hieronder is nu een PER-PAGINA-limiet (zie MAX_PAGINAS + haalAllePaginas
// hieronder) — de effectieve bovengrens is dus limiet × MAX_PAGINAS: nog
// steeds bewust begrensd (geen oneindige lus tegen het Monday-ratebudget),
// maar niet langer stil afgekapt bij precies één pagina (was de V1-beperking).
const MAX_MASTER_DATA_ITEMS = 250;
const MAX_UITVOERING_ITEMS = 500;
const MAX_TRAINERBOARD_ITEMS = 100;
const MAX_SCHOOL_UPDATES = 30;

/**
 * Root-cause-fix ("Scholen"-lijst toont niet alle gekoppelde scholen,
 * Vervolgronde 2026-08-22) — verzamelTrainerContext bevroeg Master Data/
 * Uitvoering/het eigen trainerboard elk met precies ÉÉN pagina (zie
 * MAX_*_ITEMS hierboven) en negeerde de door Monday teruggegeven cursor
 * volledig. Bij een board/trainerboard met méér items dan die per-pagina-
 * limiet vielen scholen/trainingen dus stil weg — Monday's items_page-
 * volgorde is niet gegarandeerd chronologisch, dus dit kon zowel oudere als
 * recente scholen raken, afhankelijk van waar de cap toevallig viel. Dit is
 * een van de twee onderliggende oorzaken van het gerapporteerde symptoon
 * (naast de datakwaliteitsoorzaken hierboven/hieronder in dit bestand) —
 * zie het opleverrapport voor de volledige toelichting, inclusief het
 * overgebleven, NIET in code oplosbare geval (een gekoppelde school zonder
 * enige trainingshistorie én zonder de harde Master Data.Trainer-relatie).
 */
const MAX_PAGINAS = 5;

/** Haalt tot MAX_PAGINAS pagina's op via haalScholenPagina en voegt ze samen — zie MAX_PAGINAS hierboven. */
async function haalAllePaginas(opties: { boardId: string; columnIds: string[]; limit: number }): Promise<MondaySchoolItem[]> {
  const alleItems: MondaySchoolItem[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const resultaat = await haalScholenPagina({ boardId: opties.boardId, columnIds: opties.columnIds, limit: opties.limit, cursor });
    alleItems.push(...resultaat.items);
    if (!resultaat.cursor) break;
    cursor = resultaat.cursor;
  }
  return alleItems;
}

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

/**
 * Legacy-groepsnaammatch (2026-08-19, live bevestigd via /admin/trainers-
 * diagnose/monday tegen Wessels échte data): trainerboard-item 12717612402
 * → Master ID 12713002919 → centrale training 12713002919 op "4: Uitvoering
 * (Trainingen)" → School (board_relation_mm5tyc40) is daar daadwerkelijk
 * null. De eerdere .text/.value-scheidingstekenhypothese (zie
 * parseNumeriekeKolomAlsId hierboven) was dus NIET de oorzaak bij Wessels
 * live data — op zijn trainerboard zijn .text en .value voor deze Master ID
 * allebei gewoon "12713002919". De School-relatie ontbreekt dus écht op de
 * centrale training zelf (datakwaliteit, geen parsebug) — de enige
 * overgebleven schoolidentiteit bij dit soort legacy-data is de groupTitle
 * op het PERSOONLIJKE trainerboard ("Montessori Gorinchem").
 *
 * Bewust een losse, direct testbare functie (i.p.v. inline .trim().
 * toLowerCase()) — "veilig/voorspelbaar" normaliseren, expliciet GEEN fuzzy/
 * AI-match: alleen witruimte aan de randen wegnemen, meervoudige
 * witruimte-in-de-naam samenvouwen tot één spatie (voorkomt een gemiste
 * match door een dubbele spatie in Monday-invoer), en hoofdletterongevoelig
 * vergelijken. Twee namen die na deze normalisatie nog verschillen, matchen
 * NOOIT — geen substring/edit-distance/synoniemherkenning.
 */
export function normaliseerSchoolnaamVoorMatch(naam: string): string {
  return naam.trim().toLowerCase().replace(/\s+/g, " ");
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
  /**
   * Ronde 2 (2026-08-19) — item-ID van HET SPIEGELITEM op het EIGEN
   * trainerboard van deze trainer, via de Master-ID-keten (nooit via naam).
   * `null` betekent: deze trainer heeft geen eigen trainerboard-item voor
   * deze training (bv. hard via Master Data.Trainer bevestigde school wiens
   * trainingen nooit op dit trainerboard verschenen) — dan is bewerken vanuit
   * de portal niet mogelijk: er is geen schrijfdoel en geen manier om
   * eigenaarschap voor een mutatie te herverifiëren. lib/trainers/writeback.ts
   * en de bewerk-UI moeten dit veld altijd controleren vóór ze een
   * bewerkactie aanbieden/uitvoeren — nooit een trainerboard-item-ID los van
   * hier aannemen of door de client laten aanleveren.
   */
  trainerboardItemId: string | null;
}

export interface TrainerSchoolBron {
  id: string;
  naam: string;
  onderwijstype: string | null;
  locatie: string | null;
  implementatiefase: string | null;
  contactpersoonNaam: string | null;
  /**
   * Ronde 2 afronding, Trainer-AI (2026-08-19) — of contactpersoonNaam
   * daadwerkelijk uit de LIVE board_relation-koppeling komt (.value,
   * linkedPulseIds) i.p.v. uitsluitend Monday's gecachte tekstweergave
   * (.text) — zelfde .value-over-.text-voorkeur als parseNumeriekeKolomAlsId
   * hierboven al toelicht: .text kan een verouderd/leeg-relatie-artefact
   * tonen, .value is de daadwerkelijke, actuele relatie. Puur additief
   * signaal, geen wijziging aan contactpersoonNaam zelf of aan de bestaande,
   * elders al ongewijzigd blijvende contactpersoon-UI — uitsluitend gebruikt
   * door de nieuwe Trainer-AI-context (lib/trainers/ai-context.ts) om nooit
   * een mogelijk onbetrouwbare contactpersoon aan de AI-context toe te
   * voegen (opdrachtseis "contactpersoon als deze betrouwbaar gekoppeld is").
   */
  contactpersoonBetrouwbaar: boolean;
  /**
   * Hoe deze school in de bevestigde lijst terechtkwam — intern/
   * diagnostisch, geen trainer-facing onderscheid vereist (de UI toont tier
   * 1/2 hieronder ongedifferentieerd onder "Mijn scholen"). Betrouwbaarheid,
   * hoog naar lager: "trainer-relatie"/"training-koppeling" zijn beide de
   * harde keten (Master Data.Trainer resp. Master ID → centrale training →
   * School Connect Boards — altijd voorrang, zie verzamelTrainerContext).
   * "legacy-unique" is de nieuwe, bewust zwakkere tier: uitsluitend bereikt
   * wanneer de harde keten GEEN bruikbare School-relatie oplevert, en dan
   * alleen bij een unieke groupTitle-naammatch (normaliseerSchoolnaamVoorMatch)
   * tegen Master Data — nooit bij 0 of 2+ kandidaten. `id` hierboven is ook
   * voor deze tier altijd het echte, opgezochte Master Data item-ID, nooit
   * de groepnaam zelf — toekomstige write-backs mogen dus altijd blind op
   * `id` vertrouwen, ongeacht welke `bron` de koppeling opleverde.
   */
  bron: "trainer-relatie" | "training-koppeling" | "legacy-unique";
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
  contactpersoonBetrouwbaar: boolean;
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
    query HaalTrainerboardStructuur($boardId: ID!, $itemsLimit: Int, $cursor: String, $columnIds: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: $itemsLimit, cursor: $cursor) {
          cursor
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
  type RuwTrainerboardItem = { id: string; name: string; group: { title: string } | null; column_values: MondayColumnValue[] };
  type TrainerboardPaginaRespons = { boards: { items_page: { cursor: string | null; items: RuwTrainerboardItem[] } }[] };

  // Zelfde bounded-meerpagina-doorloop als haalAllePaginas hierboven (Master
  // Data/Uitvoering) — deze query loopt los omdat hij, i.t.t. die twee, geen
  // haalScholenPagina hergebruikt (ander veldenschema: group.title erbij).
  const alleRuweItems: RuwTrainerboardItem[] = [];
  let volgendeCursor: string | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const data: TrainerboardPaginaRespons = await mondayQuery<TrainerboardPaginaRespons>(query, {
      boardId,
      itemsLimit,
      cursor: volgendeCursor,
      columnIds: [TB_MASTER_ID_KOLOM],
    });

    const paginaResultaat: TrainerboardPaginaRespons["boards"][number]["items_page"] | undefined = data.boards[0]?.items_page;
    if (!paginaResultaat) break;
    alleRuweItems.push(...paginaResultaat.items);
    if (!paginaResultaat.cursor) break;
    volgendeCursor = paginaResultaat.cursor;
  }

  return {
    items: alleRuweItems.map((item) => {
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
 * van déze trainer — harde relatie, tier 1), alle Uitvoering-trainingen
 * gegroepeerd per gekoppeld school-ID, en het eigen trainerboard (Master ID
 * → centrale training → School — óók tier 1 — met tier 2, de unieke legacy-
 * groepsnaammatch, als gecontroleerde terugval zodra die School-relatie
 * zelf leeg is; zie normaliseerSchoolnaamVoorMatch hierboven voor de
 * volledige toelichting + live aanleiding). Geen lokale cache tussen
 * aanroepen — bewuste architectuurkeuze (architectuurrapport §5/§12): elke
 * paginalaad is een live Monday-read.
 */
async function verzamelTrainerContext(trainer: AuthTrainer): Promise<TrainerMondayContext> {
  const [masterDataItems, uitvoeringItems, trainerboardStructuur] = await Promise.all([
    haalAllePaginas({
      boardId: MASTER_DATA_BOARD_ID,
      columnIds: [MD_TRAINER_KOLOM, MD_HOOFDCONTACTPERSOON_KOLOM, MD_TYPE_SCHOOL_KOLOM, MD_LOCATION_KOLOM, MD_IMPLEMENTATIEFASE_KOLOM],
      limit: MAX_MASTER_DATA_ITEMS,
    }),
    haalAllePaginas({
      boardId: UITVOERING_BOARD_ID,
      columnIds: [UV_SCHOOL_KOLOM, UV_STATUS_KOLOM, UV_DATUM_KOLOM, UV_LOGBOEK_KOLOM],
      limit: MAX_UITVOERING_ITEMS,
    }),
    haalTrainerboardStructuur(trainer.mondayTrainerboardId, MAX_TRAINERBOARD_ITEMS),
  ]);

  const masterDataById = new Map<string, MasterDataSchoolRuw>();
  for (const item of masterDataItems) {
    const kolommen = naarKolomMap(item.column_values);
    masterDataById.set(item.id, {
      id: item.id,
      naam: item.name,
      onderwijstype: kolommen.get(MD_TYPE_SCHOOL_KOLOM)?.text || null,
      locatie: kolommen.get(MD_LOCATION_KOLOM)?.text || null,
      implementatiefase: kolommen.get(MD_IMPLEMENTATIEFASE_KOLOM)?.text || null,
      contactpersoonNaam: kolommen.get(MD_HOOFDCONTACTPERSOON_KOLOM)?.text || null,
      contactpersoonBetrouwbaar: parseLinkedPulseIds(kolommen.get(MD_HOOFDCONTACTPERSOON_KOLOM)?.value).length > 0,
      trainerLinkedIds: parseLinkedPulseIds(kolommen.get(MD_TRAINER_KOLOM)?.value),
    });
  }

  // Ronde 2 (2026-08-19) — ONVOORWAARDELIJK opgebouwd uit trainerboardStructuur
  // (al opgehaald via de Promise.all hierboven), niet per-tier: elk
  // trainerboard-item van déze trainer met een geldige Master ID vertelt "dit
  // trainerboard-item hoort bij die centrale training", ongeacht of de
  // centrale training zelf al een School-relatie heeft (tier 1) of pas via
  // de naam-heuristiek hieronder wordt bevestigd (tier 2). Vóór deze ronde
  // werd tbItem.id nergens bewaard — dit is de enige plek waar het
  // trainerboard-item-ID ooit gekend is, dus moet het hier al vastgelegd
  // worden, vóór de TrainingSamenvatting-objecten hieronder gebouwd worden.
  // Randgeval (geen bug, bestond al): delen twee trainerboard-rijen
  // toevallig dezelfde Master ID ("datakwaliteitsuitzondering"), dan wint de
  // laatst-verwerkte hier — nu zichtbaar omdat deze Map een schrijfdoel
  // voedt, maar niet nieuw veroorzaakt door deze wijziging.
  const trainerboardItemIdByMasterId = new Map<string, string>();
  for (const tbItem of trainerboardStructuur.items) {
    if (!tbItem.masterId) continue;
    trainerboardItemIdByMasterId.set(tbItem.masterId, tbItem.id);
  }

  const trainingenPerSchool = new Map<string, TrainingSamenvatting[]>();
  // samenvatting hier bewaard (niet alleen schoolIds) — de tier-2-lus
  // hieronder heeft de VOLLEDIGE TrainingSamenvatting nodig om diezelfde
  // training alsnog aan een legacy-unique-bevestigde school te kunnen
  // toewijzen (zie de toelichting daar): zonder dit zou elke training met
  // een lege School-kolom zelf nergens herbruikbaar zijn, ook niet via de
  // Master-ID-keten die 'm daar wél uniek aan toewijst.
  const uitvoeringById = new Map<string, { schoolIds: string[]; samenvatting: TrainingSamenvatting }>();
  for (const item of uitvoeringItems) {
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
      trainerboardItemId: trainerboardItemIdByMasterId.get(item.id) ?? null,
    };
    uitvoeringById.set(item.id, { schoolIds, samenvatting });
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
        contactpersoonBetrouwbaar: school.contactpersoonBetrouwbaar,
        bron: "trainer-relatie",
      });
    }
  }

  // Tier 1 (harde relatie, vervolg) / Tier 2 (unieke legacy-schoolmatch):
  // via het eigen trainerboard — Master ID → centrale training → School.
  const suggesties: TrainerSchoolSuggestie[] = [];
  // Dedup op centrale-training-ID (niet op trainerboard-item-ID): voorkomt
  // dubbeltelling als twee trainerboard-rijen toevallig dezelfde Master ID
  // hebben — geen ander doel dan dat, want elke ECHTE training heeft hier
  // hoe dan ook precies één centrale-training-ID.
  const legacyGekoppeldeTrainingIds = new Set<string>();
  for (const tbItem of trainerboardStructuur.items) {
    if (!tbItem.masterId) continue;
    const training = uitvoeringById.get(tbItem.masterId);
    if (!training) continue; // hangende/ongeldige Master ID — geen crash, gewoon overslaan

    if (training.schoolIds.length > 0) {
      // Tier 1 (harde relatie) — wint altijd: zodra de centrale training
      // zelf een bruikbare School-koppeling heeft, wordt de legacy-
      // naammatch hieronder voor dit trainerboard-item nooit meer bereikt
      // (de `continue` hieronder slaat 'm structureel over) — precies de
      // opdrachtseis "Tier 1 wint altijd", zonder een aparte prioriteitscheck.
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
          contactpersoonBetrouwbaar: school.contactpersoonBetrouwbaar,
          bron: "training-koppeling",
        });
      }
      continue;
    }

    // Tier 2 (unieke legacy-schoolmatch, 2026-08-19 — zie
    // normaliseerSchoolnaamVoorMatch se toelichting hierboven voor de live-
    // bevestigde aanleiding): School-kolom leeg op de centrale training.
    // De groupTitle op het PERSOONLIJKE trainerboard is dan de enige
    // overgebleven schoolidentiteit — bij een unieke, veilig-genormaliseerde
    // naammatch tegen Master Data is dat betrouwbaar genoeg om als bevestigd
    // te tonen (nooit fuzzy, nooit bij ambiguïteit). Bij 0 of 2+ kandidaten:
    // niets — geen suggestie, geen bevestiging, nooit gokken (ongewijzigd
    // t.o.v. de oorspronkelijke, uitsluitend-suggestie-versie van deze tier).
    if (!tbItem.groupTitle) continue;
    const groepNaamGenormaliseerd = normaliseerSchoolnaamVoorMatch(tbItem.groupTitle);
    const kandidaten = Array.from(masterDataById.values()).filter((school) => normaliseerSchoolnaamVoorMatch(school.naam) === groepNaamGenormaliseerd);
    if (kandidaten.length !== 1) continue;
    const kandidaat = kandidaten[0]!;

    // Nooit een reeds bevestigde school overschrijven met de zwakkere
    // legacy-bron (bv. al bevestigd via tier 1 door een ander trainerboard-
    // item) — maar dat mag de trainingstoewijzing hieronder niet blokkeren:
    // meerdere trainerboard-items binnen dezelfde groep (Montessori
    // Gorinchem heeft er meerdere "Training"/"Online uur"-items van, live
    // bevestigd) moeten ALLEMAAL hun eigen centrale training aan deze school
    // toevoegen, ongeacht welke tier de school uiteindelijk bevestigde. Vóór
    // deze fix stond hier `if (scholen.has(kandidaat.id)) continue;` — dat
    // sloeg zowel de (overbodige) herbevestiging als de (wél noodzakelijke)
    // trainingstoewijzing structureel over voor elk item ná het eerste in
    // dezelfde groep — precies het gerapporteerde "0 open/0 gepland/0
    // gedaan"-symptoon voor Montessori Gorinchem.
    if (!scholen.has(kandidaat.id)) {
      scholen.set(kandidaat.id, {
        id: kandidaat.id,
        naam: kandidaat.naam,
        onderwijstype: kandidaat.onderwijstype,
        locatie: kandidaat.locatie,
        implementatiefase: kandidaat.implementatiefase,
        contactpersoonNaam: kandidaat.contactpersoonNaam,
        contactpersoonBetrouwbaar: kandidaat.contactpersoonBetrouwbaar,
        bron: "legacy-unique",
      });
    }

    // De training zelf identificeren we via de bestaande Master-ID-keten
    // (training.samenvatting.id is de centrale-training-ID, nooit het
    // trainerboard-item-ID of de schoolnaam) — de naamfallback vervangt
    // uitsluitend de ontbrekende School-relation, niet de trainingsidentiteit
    // zelf. Zonder de dedup-guard zou een datakwaliteitsuitzondering (twee
    // trainerboard-rijen met dezelfde Master ID) dezelfde training twee keer
    // in de tellingen laten meetellen.
    if (!legacyGekoppeldeTrainingIds.has(training.samenvatting.id)) {
      legacyGekoppeldeTrainingIds.add(training.samenvatting.id);
      const lijst = trainingenPerSchool.get(kandidaat.id) ?? [];
      lijst.push(training.samenvatting);
      trainingenPerSchool.set(kandidaat.id, lijst);
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

/**
 * Architectuurrapport §5 — "Mijn scholen": bevestigd (tier 1 harde relatie +
 * tier 2 unieke legacy-schoolmatch, ongedifferentieerd getoond) + apart,
 * read-only, niet-klikbaar "mogelijk gekoppeld" (2026-08-19: sinds de
 * legacy-schoolmatch-fix structureel leeg zolang elke unieke groupTitle-
 * match hierboven al bevestigd wordt — de mogelijkGekoppeld-infrastructuur
 * blijft bewust bestaan voor een eventuele toekomstige, expliciet-ambigue
 * suggestie-heuristiek, maar heeft momenteel geen enkele producent meer).
 */
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
  /**
   * Ronde 2 afronding, Trainer-AI (2026-08-19) — voor de dashboard-
   * schoolkeuze bij het Vraag-blok ("Alle scholen" / een specifieke school).
   * Bewust hier afgeleid van dezelfde context.scholen die haalDashboardData
   * toch al ophaalt, i.p.v. de pagina apart bepaalScholenVoorTrainer() te
   * laten aanroepen — dat zou verzamelTrainerContext() een tweede keer live
   * uitvoeren (geen cache tussen aanroepen, zie de toelichting daar) voor
   * exact dezelfde onderliggende data. Uitsluitend id/naam: de UI heeft geen
   * trainingtellingen nodig voor een dropdown.
   */
  bevestigdeScholen: { id: string; naam: string }[];
  /**
   * Traineromgeving V2, Fase 1 (2026-08-28) — voor de dashboard-
   * statistiekensectie ("Totaal trainingen"). Zelfde reden als
   * bevestigdeScholen hierboven: afgeleid van de data die deze functie toch
   * al opbouwt (alleTrainingenMetSchool), i.p.v. lib/trainers/dashboard.ts
   * een tweede, aparte verzamelTrainerContext()-aanroep te laten doen.
   */
  totaalTrainingen: number;
  /**
   * Correctieronde Admin Traineromgeving (2026-08-25) — ALLE trainingen van
   * deze trainer, ONGEFILTERD (elke status, met of zonder datum): de
   * actuele-trainingen-whitelist voor lib/trainers/training-actualiteit.ts.
   * Zelfde reden als bevestigdeScholen/totaalTrainingen hierboven: puur
   * hergebruik van alleTrainingenMetSchool, geen nieuwe Monday-aanroep. Moet
   * ALLE trainingen bevatten (niet alleen vandaag/komend/logboekOpenstaand)
   * — een training-verslag-concept over een reeds afgeronde ("gedaan")
   * training moet nog altijd als actueel gelden.
   */
  alleTrainingen: TrainingMetSchool[];
}

/**
 * Architectuurrapport §16 Ronde 1, herbouwd in Ronde 2 vervolg (2026-08-19)
 * op lib/trainers/training-weergave.ts se gedeelde bucket-logica —
 * uitsluitend read-only afgeleide informatie, dashboard/schooldetail/Mijn
 * scholen mogen geen van drieën meer hun eigen interpretatie van "wat
 * betekent deze training nu" hebben.
 *
 * Gedragswijziging t.o.v. de eerste Ronde-2-pas: "Vandaag" en "Verslag nog
 * invullen" waren voorheen twee ONAFHANKELIJKE filters — een training van
 * vandaag met een nog niet ingevuld logboek kon dus in BEIDE secties
 * tegelijk verschijnen. Met de nieuwe, centrale, wederzijds-exclusieve
 * bucket-indeling (training-weergave.ts) wint "Verslag nog invullen" nu
 * altijd van "Vandaag" voor zo'n training — de meer urgente sectie, geen
 * verdubbelde/verwarrende weergave meer. De "datum <= vandaag +
 * logboek niet ingevuld"-regel zelf (met Michel afgestemd, Ronde 2 eerste
 * pas) blijft ONGEWIJZIGD — zie training-weergave.ts se toelichting.
 *
 * Trainingen zonder datum worden nog altijd nergens op dit dashboard getoond
 * (expliciete opdrachtseis, ongewijzigd) — de "open"-bucket wordt hier
 * bewust niet uitgelezen.
 */
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

  const groepen = groepeerOpWeergaveStatus(alleTrainingenMetSchool, vandaag);
  const komendeTrainingen = [...groepen.komend].sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""));

  const bevestigdeScholen = Array.from(context.scholen.values())
    .map((school) => ({ id: school.id, naam: school.naam }))
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl"));

  return {
    trainingenVandaag: groepen.vandaag,
    komendeTrainingen,
    aantalScholen: context.scholen.size,
    logboekOpenstaand: groepen.verslag_nog_invullen,
    bevestigdeScholen,
    totaalTrainingen: alleTrainingenMetSchool.length,
    alleTrainingen: alleTrainingenMetSchool,
  };
}

/**
 * Ronde 3.5 (2026-08-25) — Telefonische verslaglegging: de trainingkandidaten
 * die het telefoniesysteem een gebelde trainer mag voorleggen (spec §5).
 * Bewust een EIGEN, kleinere selectie dan haalDashboardData()/haalSchoolDetail
 * (die tonen ALLE trainingen resp. gegroepeerd op de volledige bucket-
 * indeling) — hier gaat het uitsluitend om "waarschijnlijk waarvoor de
 * trainer nu net belt": recent genoeg (vandaag t/m TELEFONIE_RECENTE_DAGEN
 * dagen geleden), heeft een trainerboard-item (zonder dat kan er sowieso geen
 * verslag aan gekoppeld worden, zelfde poort als bevestigVerslag() se stap 1),
 * en niet geannuleerd (zelfde poort als bevestigVerslag() se stap 2 — nooit
 * een verslag aanbieden voor een training die toch al geen Update meer
 * accepteert). Toekomstige trainingen worden bewust NIET aangeboden (spec §5:
 * "begin klein", en inhoudelijk vreemd om nu al een verslag te maken voor een
 * training die nog moet plaatsvinden) — een bewuste V1-vereenvoudiging, zie
 * het opleverrapport.
 *
 * Zelfde databron/resolutieketen als haalDashboardData (verzamelTrainerContext)
 * — geen aparte Monday-aanroep, geen tweede interpretatie van "welke
 * trainingen hoort deze trainer" (spec §6: de write-identiteit komt altijd uit
 * dezelfde resolutieladder, nooit uit een losse telefonie-specifieke query).
 */
const TELEFONIE_RECENTE_DAGEN = 3;

export async function haalRecenteTrainingenVoorTelefonie(trainer: AuthTrainer): Promise<TrainingMetSchool[]> {
  const context = await verzamelTrainerContext(trainer);
  const vandaag = vandaagIsoAmsterdam();
  const vandaagMs = new Date(`${vandaag}T00:00:00Z`).getTime();

  const alle: TrainingMetSchool[] = [];
  for (const school of context.scholen.values()) {
    for (const training of context.trainingenPerSchool.get(school.id) ?? []) {
      alle.push({ ...training, schoolId: school.id, schoolNaam: school.naam });
    }
  }

  return alle
    .filter((t) => t.trainerboardItemId !== null && t.status !== "geannuleerd" && t.datum !== null)
    .filter((t) => {
      const diffDagen = (vandaagMs - new Date(`${t.datum}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24);
      return diffDagen >= 0 && diffDagen <= TELEFONIE_RECENTE_DAGEN;
    })
    .sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? "")); // meest recent eerst — spec §5 se prioriteit vandaag > gisteren > eerder
}

/**
 * Traineromgeving V2, Fase 1 (2026-08-28) — platte lijst van ALLE trainingen
 * van deze trainer, voor de nieuwe /trainingen-pagina ("Bekijk alle
 * trainingen" vanaf het dashboard). Zelfde iteratiepatroon als
 * haalDashboardData/haalRecenteTrainingenVoorTelefonie hierboven — geen
 * nieuwe Monday-aanroep, geen tweede interpretatie van "welke trainingen
 * horen bij deze trainer". Bewust ONGEFILTERD (i.t.t. beide functies
 * hierboven, die respectievelijk op datum-aanwezigheid resp. recentheid
 * filteren): de /trainingen-pagina toont zelf alle 6 weergavestatussen in
 * eigen secties (groepeerOpWeergaveStatus, training-weergave.ts), dus filteren
 * hier zou informatie voor die pagina wegnemen.
 */
export async function haalAlleTrainingenVoorTrainer(trainer: AuthTrainer): Promise<TrainingMetSchool[]> {
  const context = await verzamelTrainerContext(trainer);
  const alle: TrainingMetSchool[] = [];
  for (const school of context.scholen.values()) {
    for (const training of context.trainingenPerSchool.get(school.id) ?? []) {
      alle.push({ ...training, schoolId: school.id, schoolNaam: school.naam });
    }
  }
  return alle;
}

/**
 * Traineromgeving V2, Fase 5 (2026-08-24) — Admin Schooldetail: schoolbasis
 * zoals hieronder ook al voor elke school werd opgebouwd (id/naam/
 * trainerIds), nu AANGEVULD met onderwijstype/locatie — dezelfde twee kolommen
 * die hieronder al in de Master Data-fetch zaten (columnIds) maar tot nu toe
 * niet werden uitgelezen (alleen MD_TRAINER_KOLOM). Zuiver additief: geen
 * extra Monday-aanroep, geen wijziging aan trainingenPerTrainer/
 * scholenPerTrainer hieronder — uitsluitend twee al-opgehaalde kolommen
 * alsnog parsen en een school-geïndexeerde kaart (was al een lokale
 * tussenwaarde, nu ook geretourneerd) beschikbaar maken voor
 * lib/admin/trainers/schooldetail.ts.
 */
export interface AdminSchoolMonday {
  id: string;
  naam: string;
  onderwijstype: string | null;
  locatie: string | null;
  trainerIds: string[];
}

export interface AdminTrainerMondayOverzicht {
  /** mondayUitvoerderItemId -> trainingen (met school) van die trainer. */
  trainingenPerTrainer: Map<string, TrainingMetSchool[]>;
  /** mondayUitvoerderItemId -> bevestigde scholen (id/naam) van die trainer. */
  scholenPerTrainer: Map<string, { id: string; naam: string }[]>;
  /** schoolId -> schoolbasis (naam/onderwijstype/locatie/gekoppelde trainers). */
  scholen: Map<string, AdminSchoolMonday>;
  /** schoolId -> trainingen van die school (ongeacht trainer). */
  trainingenPerSchool: Map<string, TrainingSamenvatting[]>;
}

/**
 * Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdashboard: de
 * admin-brede tegenhanger van verzamelTrainerContext/haalAlleTrainingenVoorTrainer
 * hierboven, voor een dashboard dat trainingen/scholen van MEERDERE trainers
 * tegelijk moet tonen. Bewust een NIEUWE, EXPORTED functie i.p.v.
 * verzamelTrainerContext (of haalAlleTrainingenVoorTrainer) N keer aan te
 * roepen — dat zou N keer exact dezelfde, trainer-onafhankelijke Master
 * Data-/Uitvoering-boarddata opnieuw ophalen (opdrachtseis §13: "vermijd N
 * trainers × N losse Monday-requests"). Master Data en Uitvoering worden
 * hier, net als in verzamelTrainerContext, ALTIJD volledig en ongefilterd
 * opgehaald (haalAllePaginas, zelfde twee aanroepen); het enige verschil is
 * dat de matching hieronder per SCHOOL alle gekoppelde trainers toewijst
 * (Tier 1, "Master Data.Trainer bevat het item-ID van déze trainer" —
 * dezelfde regel als verzamelTrainerContext, nu simpelweg voor elke trainer
 * tegelijk toegepast) i.p.v. te filteren op één trainer. Resultaat: exact 2
 * Monday-aanroepen, ONGEACHT het aantal trainers.
 *
 * Bewust ZONDER het eigen trainerboard per trainer op te halen (dat zou weer
 * één Monday-aanroep PER trainer betekenen) — voor een read-only
 * adminoverzicht niet nodig: trainerboardItemId is uitsluitend relevant voor
 * bewerkbaarheid vanuit de trainerportal zelf (zie TrainingSamenvatting
 * hierboven), niet voor admin-inzicht. Dit betekent ook dat Tier 2 (de
 * legacy-groupTitle-naammatch, zie verzamelTrainerContext hierboven) hier
 * niet wordt toegepast — die tier heeft, volgens de toelichting daar,
 * inmiddels structureel geen enkele producent meer (elke unieke match wordt
 * al door Tier 1 afgevangen), dus is dit in de praktijk geen inhoudelijke
 * beperking, uitsluitend een theoretische — expliciet genoemd in het
 * opleverrapport van deze fase.
 *
 * Geen caching (ook hier niet — zelfde bewuste "altijd live"-keuze als
 * verzamelTrainerContext hierboven documenteert): dit is al maar 2 live
 * Monday-reads per admin-paginabezoek, ongeacht het aantal trainers —
 * caching zou hier geen aantoonbaar performanceprobleem oplossen, uitsluitend
 * nieuwe complexiteit toevoegen (opdrachtseis §13: "geen nieuwe
 * infrastructuur zonder noodzaak").
 */
export async function haalTrainingenEnScholenVoorAlleTrainers(): Promise<AdminTrainerMondayOverzicht> {
  const [masterDataItems, uitvoeringItems] = await Promise.all([
    haalAllePaginas({
      boardId: MASTER_DATA_BOARD_ID,
      columnIds: [MD_TRAINER_KOLOM, MD_HOOFDCONTACTPERSOON_KOLOM, MD_TYPE_SCHOOL_KOLOM, MD_LOCATION_KOLOM, MD_IMPLEMENTATIEFASE_KOLOM],
      limit: MAX_MASTER_DATA_ITEMS,
    }),
    haalAllePaginas({
      boardId: UITVOERING_BOARD_ID,
      columnIds: [UV_SCHOOL_KOLOM, UV_STATUS_KOLOM, UV_DATUM_KOLOM, UV_LOGBOEK_KOLOM],
      limit: MAX_UITVOERING_ITEMS,
    }),
  ]);

  const scholenById = new Map<string, AdminSchoolMonday>();
  for (const item of masterDataItems) {
    const kolommen = naarKolomMap(item.column_values);
    scholenById.set(item.id, {
      id: item.id,
      naam: item.name,
      onderwijstype: kolommen.get(MD_TYPE_SCHOOL_KOLOM)?.text || null,
      locatie: kolommen.get(MD_LOCATION_KOLOM)?.text || null,
      trainerIds: parseLinkedPulseIds(kolommen.get(MD_TRAINER_KOLOM)?.value),
    });
  }

  const trainingenPerSchool = new Map<string, TrainingSamenvatting[]>();
  for (const item of uitvoeringItems) {
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
      trainerboardItemId: null, // niet opgehaald voor het admin-brede overzicht, zie moduletoelichting hierboven
    };
    for (const schoolId of schoolIds) {
      const lijst = trainingenPerSchool.get(schoolId) ?? [];
      lijst.push(samenvatting);
      trainingenPerSchool.set(schoolId, lijst);
    }
  }

  const trainingenPerTrainer = new Map<string, TrainingMetSchool[]>();
  const scholenPerTrainer = new Map<string, { id: string; naam: string }[]>();
  for (const school of scholenById.values()) {
    const trainingen = trainingenPerSchool.get(school.id) ?? [];
    for (const trainerId of school.trainerIds) {
      const bestaandeScholen = scholenPerTrainer.get(trainerId) ?? [];
      bestaandeScholen.push({ id: school.id, naam: school.naam });
      scholenPerTrainer.set(trainerId, bestaandeScholen);

      const bestaandeTrainingen = trainingenPerTrainer.get(trainerId) ?? [];
      for (const training of trainingen) {
        bestaandeTrainingen.push({ ...training, schoolId: school.id, schoolNaam: school.naam });
      }
      trainingenPerTrainer.set(trainerId, bestaandeTrainingen);
    }
  }

  return { trainingenPerTrainer, scholenPerTrainer, scholen: scholenById, trainingenPerSchool };
}

export interface SchoolDetail extends TrainerSchoolBron {
  /**
   * Ronde 2 vervolg (2026-08-19) — herbouwd op de centrale bucket-indeling
   * (training-weergave.ts), vervangt de eerdere, uitsluitend op de ruwe
   * status gebaseerde groepering ({open, gepland, gedaan, geannuleerd}).
   * Schooldetail toont nu dezelfde secties/prioritering als het dashboard
   * (Vandaag/Komend/Verslag nog invullen als aparte, herkenbare secties i.p.v.
   * alles onder de vlakke "Gepland"-groep) — expliciete opdrachtseis "Vraagt
   * één centrale productlogica ... Dashboard/Mijn scholen/Schooldetail elk
   * hun eigen interpretatie" mag niet meer voorkomen.
   */
  trainingen: Record<TrainingWeergaveStatus, TrainingSamenvatting[]>;
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
  const vandaag = vandaagIsoAmsterdam();

  // Ronde 2 afronding (2026-08-19) — alfabetische A-Z-sortering BINNEN elke
  // sectie, puur presentationeel (geen Monday-schrijving, geen wijziging aan
  // de bucket-indeling zelf). Bewust uitsluitend hier, niet in
  // groepeerOpWeergaveStatus zelf: haalDashboardData gebruikt diezelfde
  // functie voor "Komend" en behoudt daar zijn bestaande, chronologische
  // sortering (expliciete opdrachtseis "Op schooldetail" — het dashboard
  // wordt hier niet aangeraakt). Alle 6 secties krijgen altijd hun eigen
  // array terug (groepeerOpWeergaveStatus initialiseert ze allemaal, ook
  // leeg) — de cast hieronder is dus een exacte, gegarandeerde sleutelset.
  const groepen = groepeerOpWeergaveStatus(trainingen, vandaag);
  const gesorteerdeGroepen = Object.fromEntries(
    Object.entries(groepen).map(([sectie, lijst]) => [sectie, sorteerTrainingenAlfabetisch(lijst)])
  ) as Record<TrainingWeergaveStatus, TrainingSamenvatting[]>;

  return {
    ...school,
    trainingen: gesorteerdeGroepen,
    logboek,
  };
}

export interface TrainingVoorMutatie {
  training: TrainingSamenvatting;
  schoolId: string;
  schoolNaam: string;
}

/**
 * Ronde 2 (2026-08-19) — object-level autorisatie voor een training-
 * MUTATIE, zelfde patroon als haalSchoolDetail hierboven: trainingId moet
 * voorkomen in de resolutieladder van déze specifieke trainer, anders null
 * (nooit een 403 — een trainer mag nooit kunnen afleiden of een training-ID
 * van een andere trainer bestaat). lib/trainers/writeback.ts roept dit
 * ALTIJD zelf aan vóór een mutatie en vertrouwt nooit een trainerboard-
 * item-ID of school-ID dat uit het request zelf zou komen — die worden hier
 * vers server-side herleid uit de trainer se eigen, net opnieuw opgehaalde
 * context. Retourneert de VOLLEDIGE TrainingSamenvatting (incl.
 * trainerboardItemId) zodat de aanroeper zelf kan bepalen of bewerken
 * structureel mogelijk is (trainerboardItemId === null → niet bewerkbaar).
 */
export async function haalTrainingVoorMutatie(trainer: AuthTrainer, trainingId: string): Promise<TrainingVoorMutatie | null> {
  const context = await verzamelTrainerContext(trainer);
  for (const [schoolId, school] of context.scholen) {
    const training = (context.trainingenPerSchool.get(schoolId) ?? []).find((t) => t.id === trainingId);
    if (training) {
      return { training, schoolId, schoolNaam: school.naam };
    }
  }
  return null;
}
