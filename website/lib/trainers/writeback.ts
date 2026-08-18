import type { Payload } from "payload";
import { optionalEnv } from "@/config/env";
import { leesKolomWaarden, wijzigKolomWaarde, haalItemMetKolomWaarden } from "@/lib/sales/monday-client";
import {
  haalTrainingVoorMutatie,
  parseMondayDatum,
  type TrainingStatus,
  type TrainingSamenvatting,
} from "./monday-links";
import type { AuthTrainer } from "./auth";
import {
  KOLOM_VOOR,
  UITVOERING_BOARD_ID,
  CENTRAAL_TRAINERBOARD_ITEM_ID_KOLOM,
  STATUS_NAAR_MONDAY_LABEL,
  type TrainingRecord,
} from "./monday-columns";

// Traineromgeving V1, Ronde 2 (2026-08-19) — trainer-scoped write-back naar
// Monday (datum + status, per training). Repliceert het BEWEZEN PATROON van
// lib/sales/writeback.ts (lees actuele waarde → vergelijk → weiger bij
// conflict → schrijf → log) maar roept dat bestand nergens aan: aparte
// collectie (trainer-log-events, niet sales-log-events), apart board/
// kolomallowlist, eigen env-gate. Kolomniveau blijft de atomaire eenheid,
// exact zoals bij Sales — een training raakt 2 Monday-records (trainerboard-
// item + centrale training), die elk onafhankelijk kunnen slagen/falen/
// conflicteren; er bestaat geen "training-brede transactie".
//
// TRAINER_MONDAY_WRITEBACK_ENABLED (bewust een EIGEN, van Sales gescheiden
// vlag — Michel wil dit onafhankelijk en gecontroleerd zelf aanzetten, zie
// opleverrapport): de productiepaden hieronder blijven inert totdat deze
// omgevingsvariabele letterlijk "true" is. Vanuit DEZE sandbox is geen
// enkele live Monday-aanroep mogelijk (geen MONDAY_API_TOKEN, uitgaand
// verkeer naar api.monday.com geblokkeerd — zelfde beperking als Sales se
// schrijfpad) — vitest-tests hieronder mocken daarom uitsluitend de
// transportlaag (@/lib/sales/monday-client), niet deze orchestratielogica
// zelf: elke lees-vergelijk-stap wordt dus ECHT uitgevoerd tegen de mock,
// alleen de uiteindelijke mutatie wordt kortgesloten door de gate.
export type WriteBackStatus = "geschreven" | "conflict" | "mislukt" | "niet_geactiveerd";

export type TrainingSchrijfVeld = "datum" | "status";

export interface TrainingKolomResultaat {
  record: TrainingRecord;
  veld: TrainingSchrijfVeld;
  status: WriteBackStatus;
  boodschap: string;
  conflict?: {
    laatstGezienDoorTrainer: string | null;
    huidigOpMonday: string | null;
    gebruikerWildeZetten: string | null;
  };
}

export interface TrainingWriteBackResultaat {
  /** Exact de kolommen die dit verzoek daadwerkelijk aanraakte — niets meer. */
  kolomResultaten: TrainingKolomResultaat[];
  algeheleStatus: "volledig_geslaagd" | "deels_geslaagd" | "geweigerd_conflict" | "volledig_mislukt" | "niet_geactiveerd";
  opnieuwProberen: { trainerboard: boolean; centraal: boolean };
  /**
   * Beslissing 3 (opleverrapport Ronde 2, na review met Michel) —
   * numeric_mm5vkjzz wordt uitsluitend gelezen/gecontroleerd, nooit
   * geschreven (geen automatische Monday-datareparatie). Puur informatief:
   * beïnvloedt algeheleStatus/opnieuwProberen nooit.
   */
  dataKwaliteitSignaal?: { veld: "trainerboardMirrorSignaal"; boodschap: string };
}

export interface TrainingWijzigingsVerzoek {
  /** null = datum verwijderen (Beslissing 2) — krijgt een extra herlees-bevestigingsstap, zie schrijfDatumKolom. */
  datum?: { nieuweWaarde: string | null; verwachteHuidigeWaarde: string | null };
  /** verwachteHuidigeRuweTekst is de RUWE tekst die de trainer laatst zag (TrainingSamenvatting.ruweStatusTekst) — nooit een uit TrainingStatus terug-gecodeerd label, zie schrijfStatusKolom. */
  status?: { nieuweWaarde: TrainingStatus; verwachteHuidigeRuweTekst: string | null };
  /** Scoped retry: raakt geen kolom aan die al "geschreven" is — de aanroeper (dialoog) construeert dit verzoek dus zelf al zonder de geslaagde kolommen. */
  alleenRecord?: TrainingRecord;
}

export type TrainingMutatieUitkomst =
  | { soort: "niet_gevonden" }
  | { soort: "niet_bewerkbaar"; boodschap: string }
  | { soort: "resultaat"; resultaat: TrainingWriteBackResultaat };

async function logTrainerWriteBackPoging(
  payload: Payload,
  context: { trainerId: number; centraleTrainingId: string; trainerboardItemId: string | null; schoolId: string; schoolNaam: string },
  veld: TrainingSchrijfVeld | "trainerboardMirrorSignaal",
  status: WriteBackStatus,
  boodschap: string,
  technischeContext: Record<string, unknown>
): Promise<void> {
  await payload.create({
    collection: "trainer-log-events",
    data: {
      trainer: context.trainerId,
      occurredAt: new Date().toISOString(),
      mondayCentraleTrainingId: context.centraleTrainingId,
      mondayTrainerboardItemId: context.trainerboardItemId ?? undefined,
      mondaySchoolId: context.schoolId,
      schoolNaam: context.schoolNaam,
      veld,
      status,
      summary: `${veld}: ${status}`,
      payload: technischeContext,
    },
    overrideAccess: true,
  });
}

interface KolomSchrijfOpties {
  record: TrainingRecord;
  veld: TrainingSchrijfVeld;
  itemId: string;
  boardId: string;
  columnId: string;
  /** Live gelezen waarde (buiten deze functie, gebatcht per item — zie verwerkTrainerboardRecord/verwerkCentraalRecord), al genormaliseerd indien van toepassing (datum via parseMondayDatum). */
  actueleWaarde: string | null;
  /** Waarde in Monday-vorm — al vertaald (bv. STATUS_NAAR_MONDAY_LABEL[...], een ISO-datum, of "" bij verwijderen). */
  nieuweMondayWaarde: string;
  /** Waarde zoals de trainer 'm zou herkennen — voor het conflict-object; null bij datum-verwijderen. */
  gewenstWaardeVoorUi: string | null;
  /**
   * false voor trainerboard-mirrorschrijvingen: de trainer ziet/bevestigt
   * nooit een specifiek "laatst geziene" waarde voor DIT record (de UI toont
   * uitsluitend de centrale training se datum/status, nooit het
   * trainerboard-item se eigen kolommen apart) — er is dus geen echte
   * client-baseline om tegen te conflicteren. De centrale schrijving is de
   * enige die de trainer daadwerkelijk "zag" en dus een conflict kán
   * detecteren; het trainerboard-item is een best-effort spiegeling die
   * altijd (binnen de gate) doorgaat, met een eigen lees-vóór-schrijven
   * uitsluitend voor de audit-log se "oude waarde", nooit als weigerreden.
   */
  vergelijkBijSchrijven: boolean;
  verwachteHuidigeWaarde: string | null;
  /** Aanwezig (ook null) = doe na het schrijven een directe herlees-bevestiging; alleen gebruikt voor datum-verwijderen (Beslissing 2). */
  herlezenNaSchrijvenVerwacht?: string | null;
}

async function verwerkKolomSchrijving(
  payload: Payload,
  logContext: Parameters<typeof logTrainerWriteBackPoging>[1],
  opties: KolomSchrijfOpties
): Promise<TrainingKolomResultaat> {
  const basis = { record: opties.record, veld: opties.veld };

  if (opties.vergelijkBijSchrijven && opties.actueleWaarde !== opties.verwachteHuidigeWaarde) {
    const boodschap = `Conflict: Monday-waarde is gewijzigd (verwacht "${opties.verwachteHuidigeWaarde}", nu "${opties.actueleWaarde}") — niet overschreven.`;
    await logTrainerWriteBackPoging(payload, logContext, opties.veld, "conflict", boodschap, {
      record: opties.record,
      columnId: opties.columnId,
      verwachteHuidigeWaarde: opties.verwachteHuidigeWaarde,
      actueleWaarde: opties.actueleWaarde,
    });
    return {
      ...basis,
      status: "conflict",
      boodschap,
      conflict: {
        laatstGezienDoorTrainer: opties.verwachteHuidigeWaarde,
        huidigOpMonday: opties.actueleWaarde,
        gebruikerWildeZetten: opties.gewenstWaardeVoorUi,
      },
    };
  }

  if (optionalEnv("TRAINER_MONDAY_WRITEBACK_ENABLED") !== "true") {
    const boodschap = `Write-back naar Monday-kolom "${opties.columnId}" staat nog niet aan voor productiegebruik (TRAINER_MONDAY_WRITEBACK_ENABLED).`;
    await logTrainerWriteBackPoging(payload, logContext, opties.veld, "niet_geactiveerd", boodschap, { record: opties.record, columnId: opties.columnId });
    return { ...basis, status: "niet_geactiveerd", boodschap };
  }

  try {
    await wijzigKolomWaarde(opties.itemId, opties.boardId, opties.columnId, opties.nieuweMondayWaarde);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    await logTrainerWriteBackPoging(payload, logContext, opties.veld, "mislukt", boodschap, { record: opties.record, columnId: opties.columnId });
    return { ...basis, status: "mislukt", boodschap };
  }

  if (opties.herlezenNaSchrijvenVerwacht !== undefined) {
    // Beslissing 2 — datum-verwijderen is nooit live tegen Monday getest
    // (zie lib/sales/writeback.ts se voerDiagnostischeTerugzetting-
    // toelichting): fail-safe herlezing i.p.v. blind een "geschreven"-status
    // voorwenden. Monday's mutatie-aanroep zelf niet gooien is geen bewijs
    // dat de kolom daadwerkelijk leeg is geworden.
    let herlezenWaarde: string | null;
    try {
      const item = await haalItemMetKolomWaarden(opties.itemId, [opties.columnId]);
      herlezenWaarde = item?.column_values[0]?.text ?? null;
    } catch (error) {
      const boodschap = `Monday accepteerde de verwijdering, maar herlezen ter bevestiging mislukte: ${error instanceof Error ? error.message : String(error)}`;
      await logTrainerWriteBackPoging(payload, logContext, opties.veld, "mislukt", boodschap, { record: opties.record, columnId: opties.columnId });
      return { ...basis, status: "mislukt", boodschap };
    }
    if (herlezenWaarde !== opties.herlezenNaSchrijvenVerwacht) {
      const boodschap = `Monday accepteerde de verwijdering, maar herlezen bevestigt niet de verwachte lege waarde (gelezen "${herlezenWaarde}") — niet als geslaagd gerapporteerd.`;
      await logTrainerWriteBackPoging(payload, logContext, opties.veld, "mislukt", boodschap, { record: opties.record, columnId: opties.columnId, herlezenWaarde });
      return { ...basis, status: "mislukt", boodschap };
    }
  }

  const boodschap = `${opties.columnId}: "${opties.actueleWaarde}" -> "${opties.nieuweMondayWaarde}"`;
  await logTrainerWriteBackPoging(payload, logContext, opties.veld, "geschreven", boodschap, {
    record: opties.record,
    columnId: opties.columnId,
    oudeWaarde: opties.actueleWaarde,
    nieuweWaarde: opties.nieuweMondayWaarde,
  });
  return { ...basis, status: "geschreven", boodschap };
}

/** Vertaalt een verzoek-datumwaarde naar de Monday-schrijfvorm — "" bij verwijderen, anders de ISO-datum zelf. */
function datumNaarMondayWaarde(nieuweWaarde: string | null): string {
  return nieuweWaarde ?? "";
}

async function verwerkTrainerboardRecord(
  payload: Payload,
  logContext: Parameters<typeof logTrainerWriteBackPoging>[1],
  trainerboardItemId: string,
  trainerboardId: string,
  verzoek: TrainingWijzigingsVerzoek
): Promise<TrainingKolomResultaat[]> {
  const kolomIds: string[] = [];
  if (verzoek.datum) kolomIds.push(KOLOM_VOOR.trainerboard.datum);
  if (verzoek.status) kolomIds.push(KOLOM_VOOR.trainerboard.status);
  if (kolomIds.length === 0) return [];

  let waarden: Map<string, string | null>;
  try {
    const gelezen = await leesKolomWaarden(trainerboardItemId, kolomIds);
    waarden = new Map(gelezen.map((cv) => [cv.id, cv.text]));
  } catch (error) {
    const boodschap = `Kon trainerboard-item niet lezen: ${error instanceof Error ? error.message : String(error)}`;
    const resultaten: TrainingKolomResultaat[] = [];
    if (verzoek.datum) {
      await logTrainerWriteBackPoging(payload, logContext, "datum", "mislukt", boodschap, { record: "trainerboard" });
      resultaten.push({ record: "trainerboard", veld: "datum", status: "mislukt", boodschap });
    }
    if (verzoek.status) {
      await logTrainerWriteBackPoging(payload, logContext, "status", "mislukt", boodschap, { record: "trainerboard" });
      resultaten.push({ record: "trainerboard", veld: "status", status: "mislukt", boodschap });
    }
    return resultaten;
  }

  const taken: Promise<TrainingKolomResultaat>[] = [];

  if (verzoek.datum) {
    const actueleDatum = parseMondayDatum(waarden.get(KOLOM_VOOR.trainerboard.datum) ?? null);
    taken.push(
      verwerkKolomSchrijving(payload, logContext, {
        record: "trainerboard",
        veld: "datum",
        itemId: trainerboardItemId,
        boardId: trainerboardId,
        columnId: KOLOM_VOOR.trainerboard.datum,
        actueleWaarde: actueleDatum,
        nieuweMondayWaarde: datumNaarMondayWaarde(verzoek.datum.nieuweWaarde),
        gewenstWaardeVoorUi: verzoek.datum.nieuweWaarde,
        vergelijkBijSchrijven: false,
        verwachteHuidigeWaarde: actueleDatum,
        herlezenNaSchrijvenVerwacht: verzoek.datum.nieuweWaarde === null ? null : undefined,
      })
    );
  }

  if (verzoek.status) {
    const actueleStatusTekst = waarden.get(KOLOM_VOOR.trainerboard.status) ?? null;
    taken.push(
      verwerkKolomSchrijving(payload, logContext, {
        record: "trainerboard",
        veld: "status",
        itemId: trainerboardItemId,
        boardId: trainerboardId,
        columnId: KOLOM_VOOR.trainerboard.status,
        actueleWaarde: actueleStatusTekst,
        nieuweMondayWaarde: STATUS_NAAR_MONDAY_LABEL[verzoek.status.nieuweWaarde],
        gewenstWaardeVoorUi: verzoek.status.nieuweWaarde,
        vergelijkBijSchrijven: false,
        verwachteHuidigeWaarde: actueleStatusTekst,
      })
    );
  }

  const settled = await Promise.allSettled(taken);
  return settled.map((uitkomst, i) =>
    uitkomst.status === "fulfilled"
      ? uitkomst.value
      : {
          record: "trainerboard" as const,
          veld: (i === 0 && verzoek.datum ? "datum" : "status") as TrainingSchrijfVeld,
          status: "mislukt" as const,
          boodschap: uitkomst.reason instanceof Error ? uitkomst.reason.message : String(uitkomst.reason),
        }
  );
}

async function verwerkCentraalRecord(
  payload: Payload,
  logContext: Parameters<typeof logTrainerWriteBackPoging>[1],
  centraleTrainingId: string,
  trainerboardItemId: string,
  verzoek: TrainingWijzigingsVerzoek
): Promise<{ kolomResultaten: TrainingKolomResultaat[]; dataKwaliteitSignaal?: TrainingWriteBackResultaat["dataKwaliteitSignaal"] }> {
  const kolomIds: string[] = [CENTRAAL_TRAINERBOARD_ITEM_ID_KOLOM];
  if (verzoek.datum) kolomIds.push(KOLOM_VOOR.centraal.datum);
  if (verzoek.status) kolomIds.push(KOLOM_VOOR.centraal.status);

  let waarden: Map<string, string | null>;
  try {
    const gelezen = await leesKolomWaarden(centraleTrainingId, kolomIds);
    waarden = new Map(gelezen.map((cv) => [cv.id, cv.text]));
  } catch (error) {
    const boodschap = `Kon centrale training niet lezen: ${error instanceof Error ? error.message : String(error)}`;
    const resultaten: TrainingKolomResultaat[] = [];
    if (verzoek.datum) {
      await logTrainerWriteBackPoging(payload, logContext, "datum", "mislukt", boodschap, { record: "centraal" });
      resultaten.push({ record: "centraal", veld: "datum", status: "mislukt", boodschap });
    }
    if (verzoek.status) {
      await logTrainerWriteBackPoging(payload, logContext, "status", "mislukt", boodschap, { record: "centraal" });
      resultaten.push({ record: "centraal", veld: "status", status: "mislukt", boodschap });
    }
    return { kolomResultaten: resultaten };
  }

  // Beslissing 3 (na review met Michel) — numeric_mm5vkjzz wordt uitsluitend
  // GELEZEN, als datakwaliteitssignaal, nooit geschreven/gerepareerd. Leeg
  // (kolom is gloednieuw, nog niet gevuld): stil, geen ruis. Gelijk aan de
  // in-memory opgezochte trainerboardItemId: stil (routinebevestiging).
  // Afwijkend: gelogd, maar blokkeert de eigenlijke datum/status-schrijving
  // van de trainer op geen enkele manier.
  let dataKwaliteitSignaal: TrainingWriteBackResultaat["dataKwaliteitSignaal"];
  const mirrorWaarde = waarden.get(CENTRAAL_TRAINERBOARD_ITEM_ID_KOLOM) ?? null;
  if (mirrorWaarde && mirrorWaarde !== trainerboardItemId) {
    const boodschap = `Trainerboard item ID op de centrale training ("${mirrorWaarde}") wijkt af van het opgezochte trainerboard-item ("${trainerboardItemId}") — gesignaleerd, niet automatisch gecorrigeerd.`;
    dataKwaliteitSignaal = { veld: "trainerboardMirrorSignaal", boodschap };
    await logTrainerWriteBackPoging(payload, logContext, "trainerboardMirrorSignaal", "conflict", boodschap, {
      mondayWaarde: mirrorWaarde,
      opgezochteWaarde: trainerboardItemId,
    });
  }

  const taken: Promise<TrainingKolomResultaat>[] = [];

  if (verzoek.datum) {
    const actueleDatum = parseMondayDatum(waarden.get(KOLOM_VOOR.centraal.datum) ?? null);
    taken.push(
      verwerkKolomSchrijving(payload, logContext, {
        record: "centraal",
        veld: "datum",
        itemId: centraleTrainingId,
        boardId: UITVOERING_BOARD_ID,
        columnId: KOLOM_VOOR.centraal.datum,
        actueleWaarde: actueleDatum,
        nieuweMondayWaarde: datumNaarMondayWaarde(verzoek.datum.nieuweWaarde),
        gewenstWaardeVoorUi: verzoek.datum.nieuweWaarde,
        vergelijkBijSchrijven: true,
        verwachteHuidigeWaarde: parseMondayDatum(verzoek.datum.verwachteHuidigeWaarde),
        herlezenNaSchrijvenVerwacht: verzoek.datum.nieuweWaarde === null ? null : undefined,
      })
    );
  }

  if (verzoek.status) {
    const actueleStatusTekst = waarden.get(KOLOM_VOOR.centraal.status) ?? null;
    taken.push(
      verwerkKolomSchrijving(payload, logContext, {
        record: "centraal",
        veld: "status",
        itemId: centraleTrainingId,
        boardId: UITVOERING_BOARD_ID,
        columnId: KOLOM_VOOR.centraal.status,
        actueleWaarde: actueleStatusTekst,
        nieuweMondayWaarde: STATUS_NAAR_MONDAY_LABEL[verzoek.status.nieuweWaarde],
        gewenstWaardeVoorUi: verzoek.status.nieuweWaarde,
        vergelijkBijSchrijven: true,
        // KRITIEK: vergelijk tegen de RUWE tekst die de trainer laatst zag,
        // nooit tegen een uit TrainingStatus terug-gecodeerd label —
        // bepaalTrainingStatus() (monday-links.ts) is een defensieve,
        // niet-exacte tekstheuristiek, geen exacte inverse van
        // STATUS_NAAR_MONDAY_LABEL. Vergelijken tegen een her-gecodeerd
        // label zou een structureel vals-positief conflict opleveren zodra
        // de live Monday-tekst niet letterlijk een bekende substring bevat.
        verwachteHuidigeWaarde: verzoek.status.verwachteHuidigeRuweTekst,
      })
    );
  }

  const settled = await Promise.allSettled(taken);
  const kolomResultaten = settled.map((uitkomst, i) =>
    uitkomst.status === "fulfilled"
      ? uitkomst.value
      : {
          record: "centraal" as const,
          veld: (i === 0 && verzoek.datum ? "datum" : "status") as TrainingSchrijfVeld,
          status: "mislukt" as const,
          boodschap: uitkomst.reason instanceof Error ? uitkomst.reason.message : String(uitkomst.reason),
        }
  );
  return { kolomResultaten, dataKwaliteitSignaal };
}

function bepaalAlgeheleStatus(kolomResultaten: TrainingKolomResultaat[]): TrainingWriteBackResultaat["algeheleStatus"] {
  if (kolomResultaten.length === 0) return "volledig_geslaagd";
  if (kolomResultaten.every((k) => k.status === "niet_geactiveerd")) return "niet_geactiveerd";
  if (kolomResultaten.every((k) => k.status === "geschreven")) return "volledig_geslaagd";
  if (kolomResultaten.some((k) => k.status === "geschreven")) return "deels_geslaagd";
  if (kolomResultaten.every((k) => k.status === "conflict")) return "geweigerd_conflict";
  return "volledig_mislukt";
}

function bepaalOpnieuwProberen(kolomResultaten: TrainingKolomResultaat[]): TrainingWriteBackResultaat["opnieuwProberen"] {
  const nogNietGeslaagd = (record: TrainingRecord) =>
    kolomResultaten.some((k) => k.record === record && k.status !== "geschreven");
  return { trainerboard: nogNietGeslaagd("trainerboard"), centraal: nogNietGeslaagd("centraal") };
}

/**
 * Enige entreepunt voor een trainingsmutatie vanuit de portal. Her-
 * verifieert eigendom ALTIJD zelf server-side (haalTrainingVoorMutatie,
 * monday-links.ts) — trainingId is de enige door de client aangeleverde
 * waarde, en telt uitsluitend als geldig als hij voorkomt in de eigen,
 * vers opgehaalde resolutieladder van déze trainer (nooit een trainerboard-
 * item-ID of school-ID uit het request zelf vertrouwen).
 */
export async function werkTrainingBij(
  payload: Payload,
  trainer: AuthTrainer,
  trainingId: string,
  verzoek: TrainingWijzigingsVerzoek
): Promise<TrainingMutatieUitkomst> {
  const gevonden = await haalTrainingVoorMutatie(trainer, trainingId);
  if (!gevonden) return { soort: "niet_gevonden" };

  const { training, schoolId, schoolNaam }: { training: TrainingSamenvatting; schoolId: string; schoolNaam: string } = gevonden;
  if (training.trainerboardItemId === null) {
    return {
      soort: "niet_bewerkbaar",
      boodschap: "Deze training heeft geen eigen trainerboard-item en kan (nog) niet vanuit de portal bewerkt worden.",
    };
  }

  const logContext = {
    trainerId: trainer.id,
    centraleTrainingId: trainingId,
    trainerboardItemId: training.trainerboardItemId,
    schoolId,
    schoolNaam,
  };

  const raaktTrainerboard = verzoek.alleenRecord === undefined || verzoek.alleenRecord === "trainerboard";
  const raaktCentraal = verzoek.alleenRecord === undefined || verzoek.alleenRecord === "centraal";

  const [trainerboardResultaten, centraalUitkomst] = await Promise.all([
    raaktTrainerboard
      ? verwerkTrainerboardRecord(payload, logContext, training.trainerboardItemId, trainer.mondayTrainerboardId, verzoek)
      : Promise.resolve<TrainingKolomResultaat[]>([]),
    raaktCentraal
      ? verwerkCentraalRecord(payload, logContext, trainingId, training.trainerboardItemId, verzoek)
      : Promise.resolve<{ kolomResultaten: TrainingKolomResultaat[]; dataKwaliteitSignaal?: TrainingWriteBackResultaat["dataKwaliteitSignaal"] }>({
          kolomResultaten: [],
        }),
  ]);

  const kolomResultaten = [...trainerboardResultaten, ...centraalUitkomst.kolomResultaten];

  return {
    soort: "resultaat",
    resultaat: {
      kolomResultaten,
      algeheleStatus: bepaalAlgeheleStatus(kolomResultaten),
      opnieuwProberen: bepaalOpnieuwProberen(kolomResultaten),
      dataKwaliteitSignaal: centraalUitkomst.dataKwaliteitSignaal,
    },
  };
}
