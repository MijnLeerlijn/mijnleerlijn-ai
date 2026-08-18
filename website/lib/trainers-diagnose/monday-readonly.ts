import { mondayQuery, type MondayColumnValue } from "@/lib/sales/monday-client";

// Traineromgeving — read-only Monday-onderzoek (2026-08-19). TIJDELIJK, in
// een EIGEN map los van lib/sales/ (zelfde reden als lib/sales/monday-
// diagnostics.ts: moet later in één keer weg kunnen zonder ook maar iets
// aan productiecode aan te raken — verwijder samen met app/api/trainers-
// diagnose/, payload/components/TrainersMondayDiagnoseView.tsx, de
// TrainersMondayDiagnoseViewShell-export in AdminViewShell.tsx, en de
// bijbehorende view-registratie in payload.config.ts).
//
// Doel: A–D van het architectuuronderzoek live beantwoorden (welke
// trainerboards bestaan, board-/column-ID's, group/item/subitem-structuur,
// relatie met "1: Scholen (Master Data)", Contactpersonenstructuur, locatie
// van Updates/logboek) — zonder ook maar één keer te schrijven. Hergebruikt
// mondayQuery() (lib/sales/monday-client.ts, hiervoor geëxporteerd) voor de
// token-/foutafhandeling — geen eigen kopie daarvan. Voor Updates lezen
// bestaat al een kant-en-klare, board-onafhankelijke functie
// (haalUpdatesVoorItem, lib/sales/monday-client.ts) — die wordt hier niet
// opnieuw gebouwd, de aanroeper (de API-route) importeert 'm rechtstreeks.
//
// GEEN ENKELE mutatie-aanroep in dit bestand — uitsluitend Monday's
// query-kant. change_simple_column_value/create_update komen hier nooit voor.
//
// Queryvorm hieronder is opgebouwd uit Monday's publieke, stabiele
// GraphQL-schema (algemene platformkennis: boards/groups/items_page/
// subitems/column_values/board op een item) — nog NIET live tegen een echt
// trainerboard bevestigd vanuit dit project. Dit bestand IS het instrument
// om dat te bevestigen, niet het bewijs zelf.

/** Voorkomt dat een te grote/vergeten limietparameter alsnog een zware aanroep tegen Monday's gedeelde workspace-token veroorzaakt. */
const MAX_BOARDS = 100;
const MAX_ITEMS_PER_BOARD = 30;
const MAX_SUBITEMS_PER_ITEM = 50;
const MAX_UPDATES = 30;
/** Begrenst de gebatchte vervolgopzoeking van doelboarden in analyseerBoardRelaties() — beschermt het gedeelde Monday-ratebudget bij een board met ongewoon veel Connect Boards-kolommen/doelboarden. */
const MAX_RELATED_BOARDS = 15;

export interface MondayBoardSamenvatting {
  id: string;
  name: string;
  items_count: number | null;
  state: string | null;
}

/**
 * Lijst van boards die met het geconfigureerde MONDAY_API_TOKEN bereikbaar
 * zijn — Monday's `boards`-query kent geen vrije-tekst-naamzoekopdracht,
 * dus dit is een simpele, begrensde opsomming (op naam te doorzoeken door de
 * aanroeper/de gebruiker zelf) om de trainerboards visueel te herkennen.
 */
export async function lijstAlleBoards(limit = MAX_BOARDS): Promise<MondayBoardSamenvatting[]> {
  const query = `
    query LijstAlleBoards($limit: Int) {
      boards(limit: $limit) {
        id
        name
        items_count
        state
      }
    }
  `;
  const data = await mondayQuery<{ boards: MondayBoardSamenvatting[] }>(query, { limit: Math.min(limit, MAX_BOARDS) });
  return data.boards ?? [];
}

export interface MondayGroepInfo {
  id: string;
  title: string;
}

export interface MondayRuwItem {
  id: string;
  name: string;
  groupId: string | null;
  groupTitle: string | null;
  columnValues: MondayColumnValue[];
  subitems: { id: string; name: string; columnValues: MondayColumnValue[] }[];
}

export interface MondayBoardStructuur {
  id: string;
  name: string;
  groups: MondayGroepInfo[];
  columns: { id: string; title: string; type: string }[];
  items: MondayRuwItem[];
  /** Niet-null betekent: er zijn meer items dan itemsLimit ophaalde — geen volledige lijst. */
  meerItemsBeschikbaar: boolean;
}

interface RuweBoardResponse {
  boards: {
    id: string;
    name: string;
    groups: MondayGroepInfo[];
    columns: { id: string; title: string; type: string }[];
    items_page: {
      cursor: string | null;
      items: {
        id: string;
        name: string;
        group: MondayGroepInfo | null;
        column_values: MondayColumnValue[];
        subitems: { id: string; name: string; column_values: MondayColumnValue[] }[] | null;
      }[];
    };
  }[];
}

/**
 * Volledige, rauwe structuur van één board: groepen, kolommen (id+titel+type
 * — beantwoordt B rechtstreeks) en een begrensde pagina items mét subitems
 * en ALLE ruwe column_values (id/text/value) — de mens/het vervolgonderzoek
 * bepaalt daaruit welke kolom Master ID/Datum gepland/Status is, dit
 * bestand raadt dat zelf nergens. `board_relation`-kolomwaarden bevatten in
 * hun `value`-JSON de gekoppelde item-ID('s) — zie zoekItemMetBoard()
 * hieronder om zo'n ID direct naar board+naam te herleiden.
 */
export async function haalBoardStructuur(boardId: string, itemsLimit = MAX_ITEMS_PER_BOARD): Promise<MondayBoardStructuur | null> {
  const query = `
    query HaalBoardStructuur($boardId: ID!, $itemsLimit: Int) {
      boards(ids: [$boardId]) {
        id
        name
        groups { id title }
        columns { id title type }
        items_page(limit: $itemsLimit) {
          cursor
          items {
            id
            name
            group { id title }
            column_values { id text value }
            subitems {
              id
              name
              column_values { id text value }
            }
          }
        }
      }
    }
  `;
  const data = await mondayQuery<RuweBoardResponse>(query, { boardId, itemsLimit: Math.min(itemsLimit, MAX_ITEMS_PER_BOARD) });
  const board = data.boards[0];
  if (!board) return null;

  return {
    id: board.id,
    name: board.name,
    groups: board.groups,
    columns: board.columns,
    items: board.items_page.items.map((item) => ({
      id: item.id,
      name: item.name,
      groupId: item.group?.id ?? null,
      groupTitle: item.group?.title ?? null,
      columnValues: item.column_values,
      subitems: (item.subitems ?? []).slice(0, MAX_SUBITEMS_PER_ITEM).map((sub) => ({ id: sub.id, name: sub.name, columnValues: sub.column_values })),
    })),
    meerItemsBeschikbaar: Boolean(board.items_page.cursor),
  };
}

export interface MondayItemDetailColumnValue {
  id: string;
  /** Kolomtitel/-type van de bijbehorende Column — via de column_values.column-relatie, general platform knowledge (Monday's publieke schema), nog niet eerder elders in dit project gebruikt (haalBoardStructuur haalt title/type apart, via boards.columns). Nog niet live tegen een echt board bevestigd. */
  title: string;
  type: string;
  text: string | null;
  /** Ruwe JSON-waarde, ONGEWIJZIGD doorgegeven — bij een board_relation-kolom bevat dit de gekoppelde item-ID('s) (Monday-conventie: linkedPulseIds), bewust nooit hier al geparsed/ingekort. */
  value: string | null;
}

export interface MondayItemDetail {
  id: string;
  name: string;
  group: { id: string; title: string } | null;
  board: { id: string; name: string } | null;
  columnValues: MondayItemDetailColumnValue[];
}

/**
 * Volledig detail van één item-ID — uitgebreid (2026-08-19, opdrachtseis)
 * van de eerdere, kalere "welk board hoort hierbij"-opzoeking: naast
 * board/groep nu ook ALLE column_values, elk met title+type (uit de
 * geneste column-relatie) + text + de VOLLEDIGE ruwe value, nooit ingekort
 * — een board_relation-waarde (de gekoppelde item-ID('s)) moet volledig
 * leesbaar blijven, dat is precies het doel van deze opzoeking: een
 * gekoppeld item-ID dat in een board_relation-kolomwaarde elders (zie
 * haalBoardStructuur) wordt aangetroffen hier direct verder herleiden
 * (bevestigt bijv. of een Master ID-kandidaatkolom daadwerkelijk naar board
 * 18420120365 wijst, of ontdekt het board-ID van "8: Contactpersonen").
 */
export async function haalItemDetail(itemId: string): Promise<MondayItemDetail | null> {
  const query = `
    query HaalItemDetail($itemId: ID!) {
      items(ids: [$itemId]) {
        id
        name
        group { id title }
        board { id name }
        column_values {
          id
          text
          value
          column {
            title
            type
          }
        }
      }
    }
  `;
  const data = await mondayQuery<{
    items: {
      id: string;
      name: string;
      group: { id: string; title: string } | null;
      board: { id: string; name: string } | null;
      column_values: { id: string; text: string | null; value: string | null; column: { title: string; type: string } | null }[];
    }[];
  }>(query, { itemId });
  const item = data.items[0];
  if (!item) return null;

  return {
    id: item.id,
    name: item.name,
    group: item.group ?? null,
    board: item.board ?? null,
    columnValues: item.column_values.map((cv) => ({
      id: cv.id,
      title: cv.column?.title ?? "",
      type: cv.column?.type ?? "",
      text: cv.text,
      value: cv.value,
    })),
  };
}

export interface MondayRelatieDoelboard {
  id: string;
  /** null wanneer Monday dit doelboard niet teruggaf bij de gebatchte vervolgopzoeking (bijv. niet bereikbaar met dit token) — geen crash, gewoon een onbekende naam. */
  name: string | null;
}

export interface MondayRelatieAfhankelijkeMirror {
  id: string;
  title: string;
}

export interface MondayBoardRelationKolom {
  id: string;
  title: string;
  doelboards: MondayRelatieDoelboard[];
  /**
   * Heuristisch afgeleid — GEEN officieel Monday-veld. Voor zover bekend
   * (general platform knowledge, nog niet live bevestigd) biedt Monday's
   * publieke API geen expliciete bidirectioneel-vlag op de board_relation-
   * kolom zelf. Deze waarde is `true` wanneer minstens één doelboard zélf
   * een board_relation-kolom heeft die met zijn eigen boardIds terugwijst
   * naar dit bronbord. Twee onafhankelijke, toevallig naar elkaar wijzende
   * relaties zouden dit ten onrechte als bidirectioneel classificeren —
   * daarom altijd samen met ruweSettings tonen, nooit als enige bron.
   */
  vermoedelijkBidirectioneel: boolean;
  /** Mirror-kolommen op HETZELFDE board die deze relatiekolom als bron gebruiken (settings_str.relation_column verwijst naar dit kolom-ID). */
  afhankelijkeMirrorKolommen: MondayRelatieAfhankelijkeMirror[];
  /** Ongewijzigde, ruwe settings_str — bewaard zodat de geparste velden hierboven handmatig te verifiëren zijn tegen wat Monday werkelijk teruggaf. */
  ruweSettings: string | null;
}

export interface MondayMirrorKolom {
  id: string;
  title: string;
  /** De board_relation-kolom (op hetzelfde board) waaraan deze mirror is gekoppeld, herkend uit settings_str.relation_column — null als dat niet lukte (bv. onbekende/kapotte settings, of de bronkolom bestaat niet meer op dit board). */
  bronRelatieKolom: { id: string; title: string } | null;
  /** Kolom-ID op het doelboard dat wordt weergegeven (settings_str.displayed_column) — alleen het ID, geen naam: het doelboard wordt hier niet per se opgehaald. */
  weergegevenKolomId: string | null;
  ruweSettings: string | null;
}

export interface MondayBoardRelatieAnalyse {
  boardId: string;
  boardName: string;
  boardRelationKolommen: MondayBoardRelationKolom[];
  mirrorKolommen: MondayMirrorKolom[];
}

interface MondayRuweKolomMetSettings {
  id: string;
  title: string;
  type: string;
  settings_str: string | null;
}

/**
 * Monday's board_relation-kolom bewaart de gekoppelde doelboard-ID('s) in
 * settings_str als JSON, sleutel `boardIds` (general platform knowledge —
 * stabiel, publiek Monday-schema, nog NIET live tegen een echt trainerboard
 * bevestigd vanuit dit project — zie de moduletoelichting bovenaan). Geeft
 * bewust een lege lijst terug i.p.v. te gooien bij ontbrekende/onverwachte/
 * kapotte JSON — dit bestand doet nooit een schrijfpoging, dus een verkeerde
 * aanname hier kost hooguit een lege tabelrij, nooit een crash.
 */
function parseDoelboardIds(settingsStr: string | null): string[] {
  if (!settingsStr) return [];
  try {
    const settings = JSON.parse(settingsStr) as { boardIds?: (string | number)[] };
    return (settings.boardIds ?? []).map(String);
  } catch {
    return [];
  }
}

/**
 * Monday's mirror-kolom bewaart in settings_str (general platform knowledge,
 * zelfde voorbehoud als parseDoelboardIds hierboven) welke board_relation-
 * kolom en welke kolom op het doelboard ze weergeeft, als objecten met
 * kolom-ID's als sleutel (bijv. `{"relation_column":{"<id>":true},
 * "displayed_column":{"<id>":true}}`). Een mirror kan in theorie meerdere
 * weergegeven kolommen hebben — dit bestand toont uitsluitend de eerste
 * (voldoende voor de architectuurvraag: WELKE relatie is de bron, niet elk
 * mogelijk mirror-detail).
 */
function parseMirrorBron(settingsStr: string | null): { relationColumnId: string | null; displayedColumnId: string | null } {
  if (!settingsStr) return { relationColumnId: null, displayedColumnId: null };
  try {
    const settings = JSON.parse(settingsStr) as {
      relation_column?: Record<string, boolean>;
      displayed_column?: Record<string, boolean>;
    };
    return {
      relationColumnId: Object.keys(settings.relation_column ?? {})[0] ?? null,
      displayedColumnId: Object.keys(settings.displayed_column ?? {})[0] ?? null,
    };
  } catch {
    return { relationColumnId: null, displayedColumnId: null };
  }
}

const BOARD_MET_SETTINGS_QUERY_VELDEN = `
  id
  name
  columns {
    id
    title
    type
    settings_str
  }
`;

/**
 * Connect Boards (board_relation) en mirror-kolomanalyse voor één board —
 * beantwoordt specifiek welke boards met elkaar verbonden zijn en via welke
 * kolommen, t.b.v. de relatiearchitectuur tussen trainerboards/"4: Uitvoering
 * (Trainingen)"/"1: Scholen (Master Data)"/"8: Contactpersonen"/"5:
 * Uitvoerder training" (2026-08-19, opdrachtseis). Nooit een schrijfpoging.
 * Maximaal 2 Monday-aanroepen per analyse: één voor het board zelf, één
 * (alleen indien nodig, gebatcht, gededupliceerd en begrensd tot
 * MAX_RELATED_BOARDS) voor de naam + eigen board_relation-kolommen van elk
 * uniek doelboard — dat laatste is nodig voor zowel boardnaam-weergave als
 * de vermoedelijkBidirectioneel-heuristiek hierboven.
 */
export async function analyseerBoardRelaties(boardId: string): Promise<MondayBoardRelatieAnalyse | null> {
  const query = `
    query AnalyseerBoardRelatiesBoard($boardId: ID!) {
      boards(ids: [$boardId]) {
        ${BOARD_MET_SETTINGS_QUERY_VELDEN}
      }
    }
  `;
  const data = await mondayQuery<{ boards: { id: string; name: string; columns: MondayRuweKolomMetSettings[] }[] }>(query, { boardId });
  const board = data.boards[0];
  if (!board) return null;

  const relatieKolommenRuw = board.columns.filter((c) => c.type === "board_relation");
  const mirrorKolommenRuw = board.columns.filter((c) => c.type === "mirror");

  const alleDoelboardIds = Array.from(new Set(relatieKolommenRuw.flatMap((c) => parseDoelboardIds(c.settings_str)))).slice(0, MAX_RELATED_BOARDS);

  const doelboardenById = new Map<string, { name: string; relatieKolommen: MondayRuweKolomMetSettings[] }>();
  if (alleDoelboardIds.length > 0) {
    const doelData = await mondayQuery<{ boards: { id: string; name: string; columns: MondayRuweKolomMetSettings[] }[] }>(
      `
        query AnalyseerBoardRelatiesDoelboarden($ids: [ID!]) {
          boards(ids: $ids) {
            ${BOARD_MET_SETTINGS_QUERY_VELDEN}
          }
        }
      `,
      { ids: alleDoelboardIds }
    );
    for (const doelboard of doelData.boards) {
      doelboardenById.set(doelboard.id, {
        name: doelboard.name,
        relatieKolommen: doelboard.columns.filter((c) => c.type === "board_relation"),
      });
    }
  }

  const mirrorKolommen: MondayMirrorKolom[] = mirrorKolommenRuw.map((c) => {
    const { relationColumnId, displayedColumnId } = parseMirrorBron(c.settings_str);
    const bronKolom = relationColumnId ? board.columns.find((rc) => rc.id === relationColumnId) : undefined;
    return {
      id: c.id,
      title: c.title,
      bronRelatieKolom: bronKolom ? { id: bronKolom.id, title: bronKolom.title } : null,
      weergegevenKolomId: displayedColumnId,
      ruweSettings: c.settings_str,
    };
  });

  const boardRelationKolommen: MondayBoardRelationKolom[] = relatieKolommenRuw.map((c) => {
    const doelboardIds = parseDoelboardIds(c.settings_str);
    const doelboards = doelboardIds.map((id) => ({ id, name: doelboardenById.get(id)?.name ?? null }));
    const vermoedelijkBidirectioneel = doelboardIds.some((id) =>
      (doelboardenById.get(id)?.relatieKolommen ?? []).some((rc) => parseDoelboardIds(rc.settings_str).includes(board.id))
    );
    return {
      id: c.id,
      title: c.title,
      doelboards,
      vermoedelijkBidirectioneel,
      afhankelijkeMirrorKolommen: mirrorKolommen.filter((m) => m.bronRelatieKolom?.id === c.id).map((m) => ({ id: m.id, title: m.title })),
      ruweSettings: c.settings_str,
    };
  });

  return {
    boardId: board.id,
    boardName: board.name,
    boardRelationKolommen,
    mirrorKolommen,
  };
}

/** Monday-ID's zijn altijd numerieke strings — lichte input-validatie vóór een aanroeper 'm ooit doorstuurt naar Monday. */
export const MONDAY_ID_PATROON = /^\d+$/;

export { MAX_BOARDS, MAX_ITEMS_PER_BOARD, MAX_SUBITEMS_PER_ITEM, MAX_UPDATES, MAX_RELATED_BOARDS };
