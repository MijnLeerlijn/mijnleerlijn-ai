import { requireEnv, optionalEnv } from "@/config/env";

// Sales-assistent V1 (2026-08-14) — server-naar-server GraphQL-client naar
// monday.com's publieke API (https://api.monday.com/v2). Dit is een ANDERE,
// eigen verbinding dan de Claude-sessie-connector waarmee het board tijdens
// de onderzoeksfase is geïnspecteerd — die connector is sessie-specifiek en
// niet bruikbaar vanuit de gedeployde app. Deze client heeft een eigen
// MONDAY_API_TOKEN nodig (zie .env.example).
//
// Queryvorm: de root-`boards(...)`-query is deze sessie rechtstreeks,
// hand-geschreven tegen de live API uitgevoerd (zie de sessiegeschiedenis —
// "GetAllBoards") en dus direct bevestigd. `items_page`/`column_values`/
// `updates` hieronder zijn opgebouwd uit Monday's publieke, stabiele
// GraphQL-schema (algemene platformkennis) plus de RESPONSvorm die deze
// sessie via een los, purpose-built onderzoekstool is waargenomen.
//
// Write-back (2026-08-15) — `wijzigKolomWaarde()` gebruikt Monday's publieke
// `change_simple_column_value`-mutation (stabiel, publiek gedocumenteerd
// schema — algemene platformkennis, werkt voor zowel `date`- als
// `dropdown`-kolommen met een gewone stringwaarde). Deze sandbox heeft geen
// MONDAY_API_TOKEN én uitgaand verkeer naar api.monday.com wordt hier actief
// geblokkeerd door het netwerkbeleid (bevestigd via de proxy-status —
// losstaand van de eerdere, sessie-specifieke MCP-connectorbeperking) —
// deze mutation-vorm is dus NIET live tegen het echte Monday-schema getest
// vanuit deze sessie. Precies daarvoor bestaat lib/sales/monday-diagnostics.ts
// + het tijdelijke diagnosescherm: een gecontroleerde, expliciet-bevestigde
// live-smoke-test, uit te voeren door Michel in de gedeployde omgeving vóór
// productiegebruik (zie writeback.ts se MONDAY_WRITEBACK_ENABLED-gate).

const MONDAY_API_URL = "https://api.monday.com/v2";
const DEFAULT_API_VERSION = "2024-10";

interface MondayGraphQlError {
  message: string;
}

interface MondayGraphQlResponse<T> {
  data?: T;
  errors?: MondayGraphQlError[];
}

// Geëxporteerd (2026-08-19) — uitsluitend zodat lib/trainers-diagnose/
// monday-readonly.ts (tijdelijk, read-only Monday-onderzoek voor de
// Traineromgeving) dezelfde token-/foutafhandeling hergebruikt i.p.v. een
// eigen kopie te maken — er is hier geen los vertrouwensdomein zoals tussen
// Helpdesk- en persoonlijke Gmail (zelfde gedeelde workspace-token, dus geen
// reden om te dupliceren). Blijft verder ongewijzigd: geen enkele bestaande
// aanroeper hierboven raakt hierdoor iets aan.
export async function mondayQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
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

/**
 * Leest de actuele waarden van meerdere kolommen van één item in één
 * aanroep — o.a. nodig voor het read-only diagnoseoverzicht (alle 3
 * schrijfbare kolommen tegelijk tonen i.p.v. 3 losse round trips).
 */
export async function leesKolomWaarden(itemId: string, columnIds: string[]): Promise<MondayColumnValue[]> {
  if (columnIds.length === 0) return [];
  const query = `
    query LeesKolomWaarden($itemId: ID!, $columnIds: [String!]) {
      items(ids: [$itemId]) {
        column_values(ids: $columnIds) { id text value }
      }
    }
  `;
  const data = await mondayQuery<{ items: { column_values: MondayColumnValue[] }[] }>(query, {
    itemId,
    columnIds,
  });
  return data.items[0]?.column_values ?? [];
}

/** Leest de actuele waarde van één kolom van één item — nodig vóór elke write-back (lib/sales/writeback.ts). */
export async function leesKolomWaarde(itemId: string, columnId: string): Promise<MondayColumnValue | null> {
  const waarden = await leesKolomWaarden(itemId, [columnId]);
  return waarden[0] ?? null;
}

/**
 * Item-naam + kolomwaarden in één aanroep — het read-only diagnosepad
 * gebruikt dit specifiek om te bevestigen dat het aangewezen testitem
 * daadwerkelijk bestaat (naam ≠ null) vóór er iets over getoond wordt,
 * i.p.v. alleen impliciet af te leiden uit een lege column_values-lijst.
 */
export async function haalItemMetKolomWaarden(itemId: string, columnIds: string[]): Promise<{ id: string; name: string; column_values: MondayColumnValue[] } | null> {
  const query = `
    query HaalItemMetKolomWaarden($itemId: ID!, $columnIds: [String!]) {
      items(ids: [$itemId]) {
        id
        name
        column_values(ids: $columnIds) { id text value }
      }
    }
  `;
  const data = await mondayQuery<{ items: { id: string; name: string; column_values: MondayColumnValue[] }[] }>(query, { itemId, columnIds });
  return data.items[0] ?? null;
}

export interface MondayColumnDefinitie {
  id: string;
  title: string;
  type: string;
}

/**
 * Board-naam + volledige kolomlijst — het read-only diagnosepad (lib/sales/
 * monday-diagnostics.ts) gebruikt dit om aantoonbaar te bevestigen dat de 3
 * bekende, hardcoded column-ID's (lib/sales/monday-columns.ts) daadwerkelijk
 * op het live board bestaan, vóór er ooit naar geschreven wordt.
 */
export async function haalBoardMetKolommen(boardId: string): Promise<{ id: string; name: string; columns: MondayColumnDefinitie[] } | null> {
  const query = `
    query HaalBoardMetKolommen($boardId: ID!) {
      boards(ids: [$boardId]) {
        id
        name
        columns { id title type }
      }
    }
  `;
  const data = await mondayQuery<{ boards: { id: string; name: string; columns: MondayColumnDefinitie[] }[] }>(query, { boardId });
  return data.boards[0] ?? null;
}

/**
 * Schrijft één kolomwaarde weg via Monday's `change_simple_column_value` —
 * accepteert een gewone stringwaarde (werkt voor zowel `date`- als
 * `dropdown`-kolomtypen, de enige 2 typen die Sales V1 ooit beschrijft, zie
 * lib/sales/monday-columns.ts se SchrijfbareKolomId). `create_labels_if_missing:
 * false` is bewust hard hier (nooit optioneel/aanroeper-instelbaar) — een
 * waarde die geen bestaand dropdown-label is moet een duidelijke Monday-fout
 * geven, nooit stilzwijgend een nieuw label op het live board aanmaken.
 * Roep dit NOOIT rechtstreeks aan buiten lib/sales/writeback.ts — dat bestand
 * bewaakt de kolom-allowlist, conflictdetectie en audit-logging.
 */
export async function wijzigKolomWaarde(itemId: string, boardId: string, columnId: string, waarde: string): Promise<void> {
  const mutation = `
    mutation WijzigKolomWaarde($itemId: ID!, $boardId: ID!, $columnId: String!, $waarde: String!) {
      change_simple_column_value(
        item_id: $itemId
        board_id: $boardId
        column_id: $columnId
        value: $waarde
        create_labels_if_missing: false
      ) {
        id
      }
    }
  `;
  await mondayQuery<{ change_simple_column_value: { id: string } }>(mutation, { itemId, boardId, columnId, waarde });
}
