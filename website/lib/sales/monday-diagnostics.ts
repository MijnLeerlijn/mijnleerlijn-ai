import type { Payload } from "payload";
import { haalBoardMetKolommen, haalItemMetKolomWaarden } from "./monday-client";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM, type SchrijfbareKolomId } from "./monday-columns";
import { voerWriteBackUit, type WriteBackResultaat } from "./writeback";

// Write-back-diagnose (2026-08-15) — UITSLUITEND voor het tijdelijke
// admin-only diagnosescherm (/admin/sales/monday-diagnose). Bewust in een
// EIGEN bestand, los van lib/sales/writeback.ts (de productie-write-back-
// service): dit bestand + het bijbehorende scherm zijn expliciet tijdelijk
// (opdrachtseis: "verwijder of verberg die na succesvolle verificatie") en
// moeten later in één keer weg kunnen zonder ook maar iets aan de
// productiecode aan te raken.
//
// Hergebruikt bewust de ECHTE productieprimitief (voerWriteBackUit, dus ook
// dezelfde conflictdetectie/audit-logging) i.p.v. een aparte testmutatie te
// verzinnen — de smoke-test moet precies het pad bewijzen dat productie ook
// gebruikt, niet een nagebouwd, mogelijk afwijkend testpad. Enige verschil:
// `forceerDiagnostisch: true` (omzeilt de MONDAY_WRITEBACK_ENABLED-
// productiegate, zie writeback.ts) en een lees-na-schrijven-stap die het
// bewijs (oud → test → teruggelezen) teruggeeft aan de UI.

const DRIE_SCHRIJFBARE_KOLOMMEN: { id: SchrijfbareKolomId; label: string }[] = [
  { id: SCHOLEN_KOLOM.datumLaatsteContact, label: "Datum laatste contact" },
  { id: SCHOLEN_KOLOM.datumVolgendeActie, label: "Datum volgende actie" },
  { id: SCHOLEN_KOLOM.typeSchool, label: "Type school" },
];

export interface MondayKolomVerificatie {
  columnId: string;
  label: string;
  gevondenOpBoard: boolean;
  liveType: string | null;
  huidigeWaarde: string | null | undefined; // undefined = geen testitem opgegeven, dus niet gelezen
}

export interface MondayKoppelingVerificatie {
  boardBereikbaar: boolean;
  boardNaam: string | null;
  kolommen: MondayKolomVerificatie[];
  testitem: { gevonden: boolean; naam: string | null } | null; // null = geen itemId opgegeven
  fout: string | null;
}

/**
 * Read-only: board 18420120365 leesbaar? de 3 bekende column-ID's
 * daadwerkelijk aanwezig op het live board? en — optioneel — de huidige
 * waarden van die 3 kolommen voor precies één, expliciet aangewezen
 * testitem. Doet NOOIT een schrijfpoging.
 */
export async function verifieerMondayKoppeling(itemId?: string): Promise<MondayKoppelingVerificatie> {
  let board: Awaited<ReturnType<typeof haalBoardMetKolommen>>;
  try {
    board = await haalBoardMetKolommen(SCHOLEN_BOARD_ID);
  } catch (error) {
    return {
      boardBereikbaar: false,
      boardNaam: null,
      kolommen: DRIE_SCHRIJFBARE_KOLOMMEN.map((k) => ({ columnId: k.id, label: k.label, gevondenOpBoard: false, liveType: null, huidigeWaarde: undefined })),
      testitem: null,
      fout: error instanceof Error ? error.message : String(error),
    };
  }
  if (!board) {
    return {
      boardBereikbaar: false,
      boardNaam: null,
      kolommen: DRIE_SCHRIJFBARE_KOLOMMEN.map((k) => ({ columnId: k.id, label: k.label, gevondenOpBoard: false, liveType: null, huidigeWaarde: undefined })),
      testitem: null,
      fout: `Board ${SCHOLEN_BOARD_ID} niet gevonden of geen toegang met dit token.`,
    };
  }

  let itemWaarden: Map<string, string | null> | null = null;
  let testitem: MondayKoppelingVerificatie["testitem"] = null;
  let leesFout: string | null = null;
  if (itemId) {
    try {
      const item = await haalItemMetKolomWaarden(itemId, DRIE_SCHRIJFBARE_KOLOMMEN.map((k) => k.id));
      testitem = { gevonden: Boolean(item), naam: item?.name ?? null };
      if (item) {
        itemWaarden = new Map(item.column_values.map((cv) => [cv.id, cv.text]));
      }
    } catch (error) {
      leesFout = error instanceof Error ? error.message : String(error);
    }
  }

  const kolommen: MondayKolomVerificatie[] = DRIE_SCHRIJFBARE_KOLOMMEN.map((k) => {
    const liveKolom = board!.columns.find((c) => c.id === k.id);
    return {
      columnId: k.id,
      label: k.label,
      gevondenOpBoard: Boolean(liveKolom),
      liveType: liveKolom?.type ?? null,
      huidigeWaarde: itemWaarden ? (itemWaarden.get(k.id) ?? null) : undefined,
    };
  });

  return { boardBereikbaar: true, boardNaam: board.name, kolommen, testitem, fout: leesFout };
}

export interface DiagnostischSchrijfResultaat {
  schrijfResultaat: WriteBackResultaat;
  gelezenNaSchrijven: string | null;
  bevestigd: boolean;
}

interface DiagnostischeSchrijfOpties {
  schoolId: number;
  mondayItemId: string;
  columnId: SchrijfbareKolomId;
  verwachteHuidigeWaarde: string | null;
  testWaarde: string;
  actorId: number;
}

/**
 * Voert de ECHTE write-back-primitief één keer uit met een expliciet
 * gekozen testwaarde (bron: "diagnostische_test", omzeilt de productiegate),
 * en leest de kolom onmiddellijk daarna opnieuw om te BEWIJZEN dat de
 * waarde daadwerkelijk veranderd is — niet enkel aannemen dat een
 * "geschreven"-status ook echt klopt.
 */
export async function voerDiagnostischeSchrijfTest(payload: Payload, opties: DiagnostischeSchrijfOpties): Promise<DiagnostischSchrijfResultaat> {
  const schrijfResultaat = await voerWriteBackUit(payload, {
    schoolId: opties.schoolId,
    mondayItemId: opties.mondayItemId,
    columnId: opties.columnId,
    nieuweWaarde: opties.testWaarde,
    verwachteHuidigeWaarde: opties.verwachteHuidigeWaarde,
    actorId: opties.actorId,
    bron: "diagnostische_test",
    forceerDiagnostisch: true,
  });

  if (schrijfResultaat.status !== "geschreven") {
    return { schrijfResultaat, gelezenNaSchrijven: null, bevestigd: false };
  }

  const item = await haalItemMetKolomWaarden(opties.mondayItemId, [opties.columnId]);
  const gelezenNaSchrijven = item?.column_values[0]?.text ?? null;
  return { schrijfResultaat, gelezenNaSchrijven, bevestigd: gelezenNaSchrijven === opties.testWaarde };
}

interface DiagnostischeTerugzettingOpties {
  schoolId: number;
  mondayItemId: string;
  columnId: SchrijfbareKolomId;
  /** De waarde vóór de test — exact wat verifieerMondayKoppeling/de eerdere testschrijving opleverde. */
  oorspronkelijkeWaarde: string | null;
  /** De waarde die de test-schrijving daadwerkelijk heeft neergezet — het conflict-snapshot voor de terugzetting. */
  verwachteHuidigeWaarde: string | null;
  actorId: number;
}

/** Zet de kolom terug naar de waarde van vóór de test — zelfde veilige pad, bron: "diagnostische_terugzetting". */
export async function voerDiagnostischeTerugzetting(payload: Payload, opties: DiagnostischeTerugzettingOpties): Promise<DiagnostischSchrijfResultaat> {
  if (opties.oorspronkelijkeWaarde === null) {
    // Monday's `change_simple_column_value` accepteert geen "leeg maken" via
    // een lege string voor elk kolomtype naar behoren — voor deze 3 kolommen
    // (date/dropdown) is een expliciete lege waarde nooit live bevestigd.
    // Veiliger: nooit gokken, de admin moet in dit geval handmatig in Monday
    // terugzetten (het diagnosescherm toont dit als expliciete melding).
    return {
      schrijfResultaat: { status: "mislukt", boodschap: "Oorspronkelijke waarde was leeg — automatisch terugzetten naar 'leeg' is niet ondersteund. Zet dit veld handmatig terug in Monday." },
      gelezenNaSchrijven: null,
      bevestigd: false,
    };
  }

  const schrijfResultaat = await voerWriteBackUit(payload, {
    schoolId: opties.schoolId,
    mondayItemId: opties.mondayItemId,
    columnId: opties.columnId,
    nieuweWaarde: opties.oorspronkelijkeWaarde,
    verwachteHuidigeWaarde: opties.verwachteHuidigeWaarde,
    actorId: opties.actorId,
    bron: "diagnostische_terugzetting",
    forceerDiagnostisch: true,
  });

  if (schrijfResultaat.status !== "geschreven") {
    return { schrijfResultaat, gelezenNaSchrijven: null, bevestigd: false };
  }

  const item = await haalItemMetKolomWaarden(opties.mondayItemId, [opties.columnId]);
  const gelezenNaSchrijven = item?.column_values[0]?.text ?? null;
  return { schrijfResultaat, gelezenNaSchrijven, bevestigd: gelezenNaSchrijven === opties.oorspronkelijkeWaarde };
}
