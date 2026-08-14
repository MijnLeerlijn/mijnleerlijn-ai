import { requireEnv, optionalEnv } from "@/config/env";

// Sales-assistent V1 (2026-08-14) — server-naar-server GraphQL-client naar
// monday.com's publieke API (https://api.monday.com/v2). Dit is een ANDERE,
// eigen verbinding dan de Claude-sessie-connector waarmee het board tijdens
// de onderzoeksfase is geïnspecteerd — die connector is sessie-specifiek en
// niet bruikbaar vanuit de gedeployde app. Deze client heeft een eigen
// MONDAY_API_TOKEN nodig (zie .env.example), dat in deze sandbox niet
// beschikbaar is/was.
//
// Queryvorm: de root-`boards(...)`-query is deze sessie rechtstreeks,
// hand-geschreven tegen de live API uitgevoerd (zie de sessiegeschiedenis —
// "GetAllBoards") en dus direct bevestigd. `items_page`/`column_values`/
// `updates` hieronder zijn opgebouwd uit Monday's publieke, stabiele
// GraphQL-schema (algemene platformkennis) plus de RESPONSvorm die deze
// sessie via een los, purpose-built onderzoekstool is waargenomen — de
// exacte queryTEKST voor die twee is dit venster niet zelf rechtstreeks
// tegen de live API getest. Aanbevolen: één smoke-test tegen een echt
// account zodra MONDAY_API_TOKEN beschikbaar is, vóór onbewaakt
// productiegebruik (zie het opleveringsrapport).
//
// GEEN mutation-functie in dit bestand — schrijven naar Monday loopt
// uitsluitend via lib/sales/writeback.ts, dat de mutatie-vorm bewust nog
// niet implementeert (zie daar).

const MONDAY_API_URL = "https://api.monday.com/v2";
const DEFAULT_API_VERSION = "2024-10";

interface MondayGraphQlError {
  message: string;
}

interface MondayGraphQlResponse<T> {
  data?: T;
  errors?: MondayGraphQlError[];
}

async function mondayQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = requireEnv("MONDAY_API_TOKEN");
  const apiVersion = optionalEnv("MONDAY_API_VERSION") ?? DEFAULT_API_VERSION;

  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "API-Version": apiVersion },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Monday API-aanroep mislukt (HTTP ${response.status}).`);
  }

  const json = (await response.json()) as MondayGraphQlResponse<T>;
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Monday GraphQL-fout: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) {
    throw new Error("Monday API gaf geen data terug.");
  }
  return json.data;
}

export interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
}

export interface MondayBoardRelationLink {
  id: string;
  name: string;
  board: { id: string; name: string };
}

export interface MondaySchoolItem {
  id: string;
  name: string;
  updated_at: string;
  column_values: MondayColumnValue[];
}

export interface MondayItemsPage {
  items: MondaySchoolItem[];
  cursor: string | null;
}

/** Haalt één pagina schoolitems op van `boardId`, met exact de opgegeven column-ID's. */
export async function haalScholenPagina(opties: {
  boardId: string;
  columnIds: string[];
  limit?: number;
  cursor?: string | null;
}): Promise<MondayItemsPage> {
  const query = `
    query HaalScholenPagina($boardId: ID!, $limit: Int, $cursor: String, $columnIds: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit, cursor: $cursor) {
          cursor
          items {
            id
            name
            updated_at
            column_values(ids: $columnIds) { id text value }
          }
        }
      }
    }
  `;
  const data = await mondayQuery<{ boards: { items_page: { cursor: string | null; items: MondaySchoolItem[] } }[] }>(
    query,
    { boardId: opties.boardId, limit: opties.limit ?? 100, cursor: opties.cursor ?? null, columnIds: opties.columnIds }
  );
  const page = data.boards[0]?.items_page;
  if (!page) {
    throw new Error(`Monday board ${opties.boardId} niet gevonden of geen toegang met dit token.`);
  }
  return { items: page.items, cursor: page.cursor };
}

export interface MondayUpdate {
  id: string;
  item_id: string;
  text_body: string;
  created_at: string;
  updated_at: string;
  creator: { id: string; name: string } | null;
}

/**
 * Haalt Updates op van een board (max `limit`, meest recente eerst
 * aangenomen maar niet gegarandeerd) en filtert ZELF client-side op
 * `created_at >= vanaf` — bewust geen server-side datumfilter-argument
 * gebruikt, omdat de exacte parametervorm daarvoor niet live is bevestigd.
 * Minder efficiënt dan een server-side filter zou zijn, maar hangt niet af
 * van een aanname over Monday's schema.
 */
export async function haalRecenteUpdates(opties: { boardId: string; vanaf: Date; limit?: number }): Promise<MondayUpdate[]> {
  const query = `
    query HaalUpdates($boardId: ID!, $limit: Int) {
      boards(ids: [$boardId]) {
        updates(limit: $limit) {
          id
          item_id
          text_body
          created_at
          updated_at
          creator { id name }
        }
      }
    }
  `;
  const data = await mondayQuery<{ boards: { updates: MondayUpdate[] }[] }>(query, {
    boardId: opties.boardId,
    limit: opties.limit ?? 500,
  });
  const alle = data.boards[0]?.updates ?? [];
  return alle.filter((update) => new Date(update.created_at).getTime() >= opties.vanaf.getTime());
}

/** Haalt alle Updates van precies één item op (voor de school-AI-chat/verrijking — live, niet uit lokale opslag). */
export async function haalUpdatesVoorItem(itemId: string, limit = 50): Promise<MondayUpdate[]> {
  const query = `
    query HaalUpdatesVoorItem($itemId: ID!, $limit: Int) {
      items(ids: [$itemId]) {
        updates(limit: $limit) {
          id
          item_id
          text_body
          created_at
          updated_at
          creator { id name }
        }
      }
    }
  `;
  const data = await mondayQuery<{ items: { updates: MondayUpdate[] }[] }>(query, { itemId, limit });
  return data.items[0]?.updates ?? [];
}

/**
 * Sales UX-ronde 3 (2026-08-14) — "Lees volledig" op het schooldetail-
 * logboek: haalt de volledige tekst van specifieke Updates on-demand op,
 * uitsluitend wanneer een gebruiker een logboekregel daadwerkelijk uitklapt
 * (of "Alles uitklappen" gebruikt, dan in één gebatchte aanroep i.p.v. N
 * losse calls). Bewust GEEN opslag hier of bij de aanroeper — dit blijft
 * strikt on-demand, respecteert de bestaande dataminimalisatie-eis
 * (sales-log-events bewaart nooit de volledige ruwe tekst). Root-level
 * `updates(ids: [...])`-query — zelfde "opgebouwd uit Monday's publieke,
 * stabiele schema, nog niet live tegen een echt account getest"-voorbehoud
 * als haalScholenPagina/haalRecenteUpdates hierboven (zie de disclaimer
 * bovenaan dit bestand): aanbevolen smoke-test zodra MONDAY_API_TOKEN
 * beschikbaar is, vóór onbewaakt productiegebruik.
 */
export async function haalUpdatesOpIds(updateIds: string[]): Promise<MondayUpdate[]> {
  if (updateIds.length === 0) return [];
  const query = `
    query HaalUpdatesOpIds($ids: [ID!]) {
      updates(ids: $ids) {
        id
        item_id
        text_body
        created_at
        updated_at
        creator { id name }
      }
    }
  `;
  const data = await mondayQuery<{ updates: MondayUpdate[] }>(query, { ids: updateIds });
  return data.updates ?? [];
}

/** Leest de actuele waarde van één kolom van één item — nodig vóór elke write-back (lib/sales/writeback.ts). */
export async function leesKolomWaarde(itemId: string, columnId: string): Promise<MondayColumnValue | null> {
  const query = `
    query LeesKolomWaarde($itemId: ID!, $columnId: [String!]) {
      items(ids: [$itemId]) {
        column_values(ids: $columnId) { id text value }
      }
    }
  `;
  const data = await mondayQuery<{ items: { column_values: MondayColumnValue[] }[] }>(query, {
    itemId,
    columnId: [columnId],
  });
  return data.items[0]?.column_values[0] ?? null;
}
