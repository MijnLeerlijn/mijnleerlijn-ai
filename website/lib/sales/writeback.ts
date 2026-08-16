import type { Payload } from "payload";
import { optionalEnv } from "@/config/env";
import { leesKolomWaarde, wijzigKolomWaarde } from "./monday-client";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM, TYPE_SCHOOL_WAARDEN, type SchrijfbareKolomId } from "./monday-columns";

// Sales-assistent V1 (2026-08-14), write-back geactiveerd 2026-08-15 —
// write-back-service. Het read-then-write/conflictdetectie/logging-deel
// hieronder was al volledig geïmplementeerd en getest; `voerMondayMutatieUit()`
// verstuurt nu de echte mutatie via lib/sales/monday-client.ts se
// wijzigKolomWaarde() (Monday's publieke `change_simple_column_value`,
// algemene platformkennis — zie de disclaimer in monday-client.ts: deze
// sandbox heeft geen MONDAY_API_TOKEN en het netwerkbeleid blokkeert
// api.monday.com actief, dus deze vorm is NIET live getest vanuit deze
// sessie).
//
// MONDAY_WRITEBACK_ENABLED-gate (2026-08-15): de 3 PRODUCTIEPADEN hieronder
// (schrijfDatumLaatsteContactTerug/schrijfDatumVolgendeActieTerug/
// schrijfTypeSchoolTerug — automatisch of ná een echte gebruikersbeslissing
// over een echte lead) blijven inert totdat deze omgevingsvariabele letterlijk
// "true" is in de ECHTE, gedeployde omgeving — een bewuste, aparte stap los
// van elke codepush, precies om nooit per ongeluk naar echte leads te
// schrijven vóór de live smoke-test (lib/sales/monday-diagnostics.ts, het
// tijdelijke diagnosescherm) is geslaagd. Het diagnosepad zelf omzeilt deze
// gate bewust (`forceerDiagnostisch: true`) — het is al even streng bewaakt
// via admin-only autorisatie + expliciete bevestiging per schrijfactie in de
// UI, en is precies het mechanisme waarmee Michel de gate straks bewust omzet.
//
// Alles ERomheen blijft de al afgesproken bouw-/testeis:
// - Lees eerst de actuele Monday-waarde (nooit blind schrijven).
// - Weiger bij een conflict — nooit stilzwijgend overschrijven.
// - Log altijd (geschreven, conflict, of mislukt) in sales-log-events met
//   oude waarde, nieuwe waarde, actor en tijdstip.
// - Accepteert uitsluitend een SchrijfbareKolomId — een zichtbare
//   kolomnaam of niet-toegestane kolom-ID compileert simpelweg niet.
// - Type school schrijft uitsluitend een van de live bevestigde
//   TYPE_SCHOOL_WAARDEN — nooit doorgestuurd naar Monday als het niet exact
//   matcht (dubbele bodem naast create_labels_if_missing: false in
//   monday-client.ts).
export type WriteBackStatus = "geschreven" | "conflict" | "niet_geactiveerd" | "mislukt";

export interface WriteBackResultaat {
  status: WriteBackStatus;
  boodschap: string;
}

export interface WriteBackOpties {
  schoolId: number;
  mondayItemId: string;
  columnId: SchrijfbareKolomId;
  nieuweWaarde: string;
  /** Waarde die de aanroeper vlak vóór deze aanroep zelf al heeft gelezen — conflict als de live waarde daarvan afwijkt. */
  verwachteHuidigeWaarde: string | null;
  /** null = automatische write-back (bv. Datum laatste contact), geen menselijke actor. */
  actorId: number | null;
  bron: "veld_correctie_voorstel" | "actie_geaccepteerd" | "automatisch_laatste_contact" | "diagnostische_test" | "diagnostische_terugzetting";
  relatedProposalId?: number;
  relatedActionId?: number;
  /**
   * Uitsluitend gezet door lib/sales/monday-diagnostics.ts — omzeilt de
   * MONDAY_WRITEBACK_ENABLED-productiegate. Nooit vanuit een echte
   * proposal-/sync-/education-type-flow zetten.
   */
  forceerDiagnostisch?: boolean;
}

async function logWriteBackPoging(
  payload: Payload,
  opties: WriteBackOpties,
  status: WriteBackStatus,
  boodschap: string,
  oudeWaarde: string | null
): Promise<void> {
  await payload.create({
    collection: "sales-log-events",
    data: {
      school: opties.schoolId,
      occurredAt: new Date().toISOString(),
      type: "monday_writeback",
      source: opties.actorId ? "gebruiker" : "systeem",
      summary: `Write-back ${opties.columnId}: ${status}`,
      payload: { columnId: opties.columnId, oudeWaarde, nieuweWaarde: opties.nieuweWaarde, status, boodschap, bron: opties.bron },
      actor: opties.actorId ?? undefined,
      relatedProposal: opties.relatedProposalId,
      relatedAction: opties.relatedActionId,
    },
    overrideAccess: true,
  });
}

/**
 * Onderscheidt "de productiegate staat nog uit" (status "niet_geactiveerd",
 * verwacht/onschuldig) van elke andere mutatiefout (status "mislukt", een
 * echt probleem) — zie voerWriteBackUit hieronder. Zonder dit type zou een
 * genuine Monday-fout ná het aanzetten van de gate ten onrechte nog als
 * "niet_geactiveerd" gelogd worden.
 */
class WriteBackNietGeactiveerdError extends Error {}

/**
 * Verstuurt de echte mutatie naar Monday — uitsluitend via wijzigKolomWaarde()
 * (monday-client.ts). Twee bewakingen vóór er ooit een netwerkaanroep gebeurt:
 * (1) een Type-school-waarde moet exact een van TYPE_SCHOOL_WAARDEN zijn;
 * (2) een productie-aanroep (forceerDiagnostisch niet gezet) moet
 * MONDAY_WRITEBACK_ENABLED="true" hebben, anders inert (zie module-comment).
 */
async function voerMondayMutatieUit(itemId: string, columnId: SchrijfbareKolomId, waarde: string, forceerDiagnostisch: boolean): Promise<void> {
  if (columnId === SCHOLEN_KOLOM.typeSchool && !(TYPE_SCHOOL_WAARDEN as readonly string[]).includes(waarde)) {
    throw new Error(`Ongeldige waarde voor Type school: "${waarde}" — moet exact een van ${TYPE_SCHOOL_WAARDEN.join(", ")} zijn. Niet naar Monday verstuurd.`);
  }
  if (!forceerDiagnostisch && optionalEnv("MONDAY_WRITEBACK_ENABLED") !== "true") {
    throw new WriteBackNietGeactiveerdError(
      `Write-back naar Monday-kolom "${columnId}" staat nog niet aan voor productiegebruik (MONDAY_WRITEBACK_ENABLED). Test eerst via het diagnosescherm (/admin/sales/monday-diagnose) vóór dit voor echte leads wordt geactiveerd.`
    );
  }
  await wijzigKolomWaarde(itemId, SCHOLEN_BOARD_ID, columnId, waarde);
}

/** Kernpad: lees → vergelijk → (weiger bij conflict) → schrijf → log. Alle 3 toegestane kolommen lopen hierdoorheen. */
export async function voerWriteBackUit(payload: Payload, opties: WriteBackOpties): Promise<WriteBackResultaat> {
  let actueleWaarde: string | null;
  try {
    const kolomWaarde = await leesKolomWaarde(opties.mondayItemId, opties.columnId);
    actueleWaarde = kolomWaarde?.text ?? null;
  } catch (error) {
    const boodschap = `Kon actuele Monday-waarde niet lezen: ${error instanceof Error ? error.message : String(error)}`;
    await logWriteBackPoging(payload, opties, "mislukt", boodschap, opties.verwachteHuidigeWaarde);
    return { status: "mislukt", boodschap };
  }

  if (actueleWaarde !== opties.verwachteHuidigeWaarde) {
    const boodschap = `Conflict: Monday-waarde is gewijzigd (verwacht "${opties.verwachteHuidigeWaarde}", nu "${actueleWaarde}") — niet overschreven.`;
    await logWriteBackPoging(payload, opties, "conflict", boodschap, actueleWaarde);
    return { status: "conflict", boodschap };
  }

  try {
    await voerMondayMutatieUit(opties.mondayItemId, opties.columnId, opties.nieuweWaarde, opties.forceerDiagnostisch ?? false);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    const status: WriteBackStatus = error instanceof WriteBackNietGeactiveerdError ? "niet_geactiveerd" : "mislukt";
    await logWriteBackPoging(payload, opties, status, boodschap, actueleWaarde);
    return { status, boodschap };
  }

  await logWriteBackPoging(payload, opties, "geschreven", `${opties.columnId}: "${actueleWaarde}" -> "${opties.nieuweWaarde}"`, actueleWaarde);
  return { status: "geschreven", boodschap: "Weggeschreven naar Monday." };
}

/**
 * `Datum laatste contact` — het ENIGE veld met automatische write-back
 * (bevestigd), maar alleen als het contactmoment betrouwbaar/niet-gemigreerd
 * is (afgedwongen door de aanroeper, zie lib/sales/sync.ts) EN de nieuwe
 * datum niet ouder is dan wat er al staat — datumvergelijking, geen
 * gelijkheidscheck, dus een aparte regel t.o.v. het generieke pad hierboven.
 */
export async function schrijfDatumLaatsteContactTerug(
  payload: Payload,
  schoolId: number,
  mondayItemId: string,
  nieuweDatum: string
): Promise<WriteBackResultaat> {
  const huidig = await leesKolomWaarde(mondayItemId, SCHOLEN_KOLOM.datumLaatsteContact);
  const huidigeTekst = huidig?.text ?? null;
  if (huidigeTekst && new Date(huidigeTekst).getTime() >= new Date(nieuweDatum).getTime()) {
    const boodschap = `Monday-datum (${huidigeTekst}) is al gelijk aan of recenter dan de nieuwe waarde (${nieuweDatum}) — niet overschreven.`;
    const opties: WriteBackOpties = {
      schoolId,
      mondayItemId,
      columnId: SCHOLEN_KOLOM.datumLaatsteContact,
      nieuweWaarde: nieuweDatum,
      verwachteHuidigeWaarde: huidigeTekst,
      actorId: null,
      bron: "automatisch_laatste_contact",
    };
    await logWriteBackPoging(payload, opties, "conflict", boodschap, huidigeTekst);
    return { status: "conflict", boodschap };
  }

  return voerWriteBackUit(payload, {
    schoolId,
    mondayItemId,
    columnId: SCHOLEN_KOLOM.datumLaatsteContact,
    nieuweWaarde: nieuweDatum,
    verwachteHuidigeWaarde: huidigeTekst,
    actorId: null,
    bron: "automatisch_laatste_contact",
  });
}

/**
 * Live leesactie voor de datumconflict-precheck in lib/sales/proposals.ts
 * (Sales-logica productiecorrectie 2026-08-16, punt 12) — vóór er ooit een
 * lokale sales-actions-record wordt aangemaakt moet bekend zijn of Monday's
 * Datum volgende actie inmiddels afwijkt van wat de gebruiker nu accepteert.
 * Kale leesfunctie zonder conflictlogica — de aanroeper bepaalt zelf wat
 * "conflict" betekent voor die specifieke beslissing. Losse export i.p.v. de
 * aanroeper rechtstreeks lib/sales/monday-client.ts te laten importeren: dit
 * bestand blijft de enige plek die Monday-kolomtoegang voor Sales beheert.
 */
export async function leesActueleVolgendeActieDatum(mondayItemId: string): Promise<string | null> {
  const kolomWaarde = await leesKolomWaarde(mondayItemId, SCHOLEN_KOLOM.datumVolgendeActie);
  return kolomWaarde?.text ?? null;
}

/**
 * `Datum volgende actie` — automatisch ná acceptatie/aanpassing van een
 * Sales-voorstel/actie (bevestigd: geen aparte bevestigingsstap), maar
 * respecteert altijd een al bestaande, andere Monday-waarde (nooit stil
 * overschrijven — bevestigd).
 *
 * `bevestigdeMondayWaarde` (Sales-logica productiecorrectie 2026-08-16, punt
 * 12): alleen gezet door lib/sales/proposals.ts nadat een al aan de
 * gebruiker getoond datumconflict expliciet is opgelost (Gebruik
 * Monday-datum / Gebruik Sales-datum / Kies andere datum). Slaat dan de
 * "elke afwijkende bestaande waarde = weigeren"-precheck hieronder over —
 * dat conflict is al gezien en bewust opgelost — maar geeft de tóén getoonde
 * Monday-waarde door als verwachteHuidigeWaarde aan het generieke
 * read-conflict-write-pad, dat nog steeds live opnieuw leest: een 3e
 * wijziging ná het tonen van de keuze telt nog steeds als conflict, nooit
 * blind overschrijven.
 */
export async function schrijfDatumVolgendeActieTerug(
  payload: Payload,
  schoolId: number,
  mondayItemId: string,
  nieuweDatum: string,
  actorId: number,
  relatedProposalId?: number,
  relatedActionId?: number,
  bevestigdeMondayWaarde?: string | null
): Promise<WriteBackResultaat> {
  if (bevestigdeMondayWaarde !== undefined) {
    return voerWriteBackUit(payload, {
      schoolId,
      mondayItemId,
      columnId: SCHOLEN_KOLOM.datumVolgendeActie,
      nieuweWaarde: nieuweDatum,
      verwachteHuidigeWaarde: bevestigdeMondayWaarde,
      actorId,
      bron: "actie_geaccepteerd",
      relatedProposalId,
      relatedActionId,
    });
  }

  const huidig = await leesKolomWaarde(mondayItemId, SCHOLEN_KOLOM.datumVolgendeActie);
  const huidigeTekst = huidig?.text ?? null;

  // Geen "sinds-het-voorstel"-snapshotvergelijking (die bestaat voor dit veld
  // niet — backfill-voorstellen worden niet per se met een snapshot gemaakt):
  // een reeds aanwezige, ANDERE waarde is hier altijd een conflict, punt.
  if (huidigeTekst && huidigeTekst !== nieuweDatum) {
    const boodschap = `Monday heeft al een andere vervolgdatum (${huidigeTekst}) — niet overschreven.`;
    const opties: WriteBackOpties = {
      schoolId,
      mondayItemId,
      columnId: SCHOLEN_KOLOM.datumVolgendeActie,
      nieuweWaarde: nieuweDatum,
      verwachteHuidigeWaarde: huidigeTekst,
      actorId,
      bron: "actie_geaccepteerd",
      relatedProposalId,
      relatedActionId,
    };
    await logWriteBackPoging(payload, opties, "conflict", boodschap, huidigeTekst);
    return { status: "conflict", boodschap };
  }

  return voerWriteBackUit(payload, {
    schoolId,
    mondayItemId,
    columnId: SCHOLEN_KOLOM.datumVolgendeActie,
    nieuweWaarde: nieuweDatum,
    verwachteHuidigeWaarde: huidigeTekst,
    actorId,
    bron: "actie_geaccepteerd",
    relatedProposalId,
    relatedActionId,
  });
}

/** `Type school` — uitsluitend na expliciete "Bevestigen en invullen in Monday" (bevestigd). */
export async function schrijfTypeSchoolTerug(
  payload: Payload,
  schoolId: number,
  mondayItemId: string,
  nieuweWaarde: string,
  verwachteHuidigeWaarde: string | null,
  actorId: number,
  relatedProposalId?: number
): Promise<WriteBackResultaat> {
  return voerWriteBackUit(payload, {
    schoolId,
    mondayItemId,
    columnId: SCHOLEN_KOLOM.typeSchool,
    nieuweWaarde,
    verwachteHuidigeWaarde,
    actorId,
    bron: "veld_correctie_voorstel",
    relatedProposalId,
  });
}
