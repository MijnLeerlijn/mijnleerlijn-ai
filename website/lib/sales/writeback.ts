import type { Payload } from "payload";
import { leesKolomWaarde } from "./monday-client";
import { SCHOLEN_KOLOM, type SchrijfbareKolomId } from "./monday-columns";

// Sales-assistent V1 (2026-08-14) — write-back-service. BEWUST NIET
// VOLLEDIG AF: het read-then-write/conflictdetectie/logging-deel hieronder
// is volledig geïmplementeerd en getest, maar `voerMondayMutatieUit()` —
// het daadwerkelijk versturen van de mutatie naar Monday — gooit bewust een
// duidelijke, herkenbare fout. De exacte mutation-JSON-vorm per kolomtype is
// deze sessie NIET live tegen het echte Monday-schema geverifieerd (alleen
// read-only tools zijn gebruikt, zoals opgedragen) — verzin die vorm hier
// niet. Rond dit specifieke functielichaam af zodra MONDAY_API_TOKEN +
// schema-introspectie (bv. get_column_type_info) weer beschikbaar zijn.
//
// Alles ERomheen is wél de bouw-/testeis die al is afgesproken:
// - Lees eerst de actuele Monday-waarde (nooit blind schrijven).
// - Weiger bij een conflict — nooit stilzwijgend overschrijven.
// - Log altijd (geschreven, conflict, of mislukt) in sales-log-events met
//   oude waarde, nieuwe waarde, actor en tijdstip.
// - Accepteert uitsluitend een SchrijfbareKolomId — een zichtbare
//   kolomnaam of niet-toegestane kolom-ID compileert simpelweg niet.
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
  bron: "veld_correctie_voorstel" | "actie_geaccepteerd" | "automatisch_laatste_contact";
  relatedProposalId?: number;
  relatedActionId?: number;
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
 * BEWUST NIET GEÏMPLEMENTEERD — zie module-comment. Gooit altijd een
 * duidelijke fout in plaats van een gegokte mutation-vorm te versturen.
 */
async function voerMondayMutatieUit(_itemId: string, columnId: SchrijfbareKolomId, _waarde: string): Promise<void> {
  throw new Error(
    `Write-back naar Monday-kolom "${columnId}" is nog niet geactiveerd: de exacte mutation-vorm is nog niet live geverifieerd tegen het echte Monday-schema. Rond lib/sales/writeback.ts se voerMondayMutatieUit() af zodra MONDAY_API_TOKEN + schema-introspectie beschikbaar zijn — verzin de vorm niet.`
  );
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
    await voerMondayMutatieUit(opties.mondayItemId, opties.columnId, opties.nieuweWaarde);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    await logWriteBackPoging(payload, opties, "niet_geactiveerd", boodschap, actueleWaarde);
    return { status: "niet_geactiveerd", boodschap };
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
 * `Datum volgende actie` — automatisch ná acceptatie/aanpassing van een
 * Sales-voorstel/actie (bevestigd: geen aparte bevestigingsstap), maar
 * respecteert altijd een al bestaande, andere Monday-waarde (nooit stil
 * overschrijven — bevestigd).
 */
export async function schrijfDatumVolgendeActieTerug(
  payload: Payload,
  schoolId: number,
  mondayItemId: string,
  nieuweDatum: string,
  actorId: number,
  relatedProposalId?: number,
  relatedActionId?: number
): Promise<WriteBackResultaat> {
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
