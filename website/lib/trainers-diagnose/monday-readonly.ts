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

export interface MondayItemBoardInfo {
  id: string;
  name: string;
  board: { id: string; name: string } | null;
}

/**
 * Zoekt op één item-ID uit welk board dat item komt — bedoeld om een
 * gekoppeld item-ID dat in een board_relation-kolomwaarde (zie
 * haalBoardStructuur hierboven) wordt aangetroffen direct te herleiden naar
 * het bijbehorende board (bevestigt bijv. of een Master ID-kandidaatkolom
 * daadwerkelijk naar board 18420120365 wijst, of ontdekt het board-ID van
 * "8: Contactpersonen").
 */
export async function zoekItemMetBoard(itemId: string): Promise<MondayItemBoardInfo | null> {
  const query = `
    query ZoekItemMetBoard($itemId: ID!) {
      items(ids: [$itemId]) {
        id
        name
        board { id name }
      }
    }
  `;
  const data = await mondayQuery<{ items: MondayItemBoardInfo[] }>(query, { itemId });
  return data.items[0] ?? null;
}

/** Monday-ID's zijn altijd numerieke strings — lichte input-validatie vóór een aanroeper 'm ooit doorstuurt naar Monday. */
export const MONDAY_ID_PATROON = /^\d+$/;

export { MAX_BOARDS, MAX_ITEMS_PER_BOARD, MAX_SUBITEMS_PER_ITEM, MAX_UPDATES };
