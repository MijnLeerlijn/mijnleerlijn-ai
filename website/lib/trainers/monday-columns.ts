import type { TrainingStatus } from "./monday-links";
import { UITVOERING_BOARD_ID, UV_DATUM_KOLOM, UV_STATUS_KOLOM } from "./monday-links";

/**
 * Welk van de twee Monday-records een kolomschrijving raakt — hier
 * gedefinieerd (niet in writeback.ts) om een circulaire import te vermijden:
 * writeback.ts importeert KOLOM_VOOR hieronder, dus dit bestand mag niets
 * uit writeback.ts terugimporteren. Zelfde precedent als Sales'
 * SchrijfbareKolomId, die ook in monday-columns.ts leeft en door
 * writeback.ts geïmporteerd wordt, nooit andersom.
 */
export type TrainingRecord = "trainerboard" | "centraal";

// Traineromgeving V1, Ronde 2 (2026-08-19) — de enige plek waar de NIEUWE
// Monday-kolommen voor het schrijfpad hardcoded staan, zelfde rol als
// lib/sales/monday-columns.ts voor Sales. Board-/kolom-ID's voor het LEESPAD
// (Master Data/Uitvoering/trainerboard-Master-ID) blijven in monday-links.ts
// — dit bestand voegt uitsluitend toe wat Ronde 2 nieuw nodig heeft, om de
// bewezen leesresolutie niet aan te raken.
//
// Persoonlijk trainerboard — NIEUW, per trainer (board-ID zelf staat al op
// AuthTrainer.mondayTrainerboardId, geen constante nodig):
export const TRAINERBOARD_DATUM_KOLOM = "date4"; // "Datum gepland"
export const TRAINERBOARD_STATUS_KOLOM = "status"; // "Status"

// Centrale training-board (18420120466) — NIEUWE spiegelkolom, uitsluitend
// leesalleen/diagnostisch in Ronde 2 (zie writeback.ts — Michel heeft
// expliciet bevestigd dat dit veld nooit automatisch geschreven/gerepareerd
// mag worden, alleen gelezen en bij afwijking gelogd als datakwaliteitssignaal).
export const CENTRAAL_TRAINERBOARD_ITEM_ID_KOLOM = "numeric_mm5vkjzz"; // "Trainerboard item ID"

/**
 * Eén bron van waarheid voor "welke kolom-ID hoort bij welk record voor
 * welk trainer-zichtbaar veld" — een client kan hier nooit een eigen
 * kolom-ID voor aanleveren (zie writeback.ts: het verzoek draagt alleen
 * "datum"/"status" + een record-scope, nooit een kolom-ID zelf), dus dit is
 * geen runtime-poortwachter tegen client-invoer (zoals Sales'
 * isSchrijfbareKolomId dat wél moet zijn voor het admin-diagnosescherm) —
 * puur een enkele plek die de mapping vastlegt, zodat een kolom-ID nergens
 * anders als losse letterlijke string hoeft terug te komen.
 */
export const KOLOM_VOOR: Record<TrainingRecord, { datum: string; status: string }> = {
  trainerboard: { datum: TRAINERBOARD_DATUM_KOLOM, status: TRAINERBOARD_STATUS_KOLOM },
  centraal: { datum: UV_DATUM_KOLOM, status: UV_STATUS_KOLOM },
};

export { UITVOERING_BOARD_ID };

/**
 * Live door Michel opgegeven, exacte Monday-statuslabels (Ronde 2-opdracht)
 * — zelfde vertrouwensstatus als lib/sales/monday-columns.ts se
 * TYPE_SCHOOL_WAARDEN (een door de opdrachtgever bevestigde livewaardenset,
 * niet zelf geraden). Uitsluitend voor SCHRIJVEN — bepaalTrainingStatus()
 * (monday-links.ts, leespad) blijft de defensieve, niet-exacte
 * tekstheuristiek en verandert hier niet door mee. `create_labels_if_missing:
 * false` (monday-client.ts, hardcoded) is de dubbele bodem: een spelfout in
 * dit label faalt hard/zichtbaar, maakt nooit stilzwijgend een nieuw
 * Monday-label aan.
 */
export const STATUS_NAAR_MONDAY_LABEL: Record<TrainingStatus, string> = {
  open: "Nieuw",
  gepland: "Gepland",
  gedaan: "Gedaan",
  geannuleerd: "Geannuleerd",
};
