import type { Payload } from "payload";
import { leesActueleVolgendeActieDatum, schrijfDatumVolgendeActieTerug, schrijfTypeSchoolTerug, type WriteBackResultaat } from "./writeback";

// Sales-assistent V1 (2026-08-14) — accept/modify/reject voor
// sales-proposals. Bewust een eigen, gecontroleerde functie i.p.v. een losse
// Payload PATCH toestaan: een beslissing heeft altijd nevenerffecten
// (actie aanmaken, write-back triggeren, logboek bijwerken) die niet aan de
// generieke REST-API overgelaten mogen worden — vandaar dat
// SalesProposals.access.update ook bewust `() => false` is.
//
// "modified" bewaart de daadwerkelijke keuze in `finalChoice` — het
// oorspronkelijke AI-voorstel (de overige velden) blijft ongewijzigd staan.
// Beide blijven dus bewaard, nooit overschreven (auditeerbaarheid).
export type ProposalBeslissing = "accepted" | "modified" | "rejected";

export interface AangepasteWaarde {
  proposedDate?: string;
  proposedType?: "mail" | "bellen" | "afspraak" | "voorbereiding" | "informatie_sturen" | "anders";
  proposedChannel?: "mail" | "telefoon" | "in_persoon" | "anders";
  proposedValue?: string;
}

export interface BeslisOpties {
  beslissing: ProposalBeslissing;
  gebruikerId: number;
  aangepasteWaarde?: AangepasteWaarde;
  /**
   * Sales-logica productiecorrectie 2026-08-16 (punt 12) — alleen gezet
   * wanneer de aanroeper een eerder in BeslisResultaat.datumconflict getoonde
   * keuze nu expliciet oplost ("Gebruik Monday-datum" / "Gebruik
   * Sales-datum" / "Kies andere datum"). Waarde: de Monday-vervolgdatum die
   * tóén aan de gebruiker getoond is (of `null` als Monday op dat moment geen
   * datum had) — slaat de hernieuwde precheck hieronder over en dient als
   * bevestigde basislijn voor de write-back, die nog steeds live herleest
   * (een 3e wijziging sinds het tonen van de keuze telt nog als conflict).
   */
  bevestigdeMondayDatum?: string | null;
}

export interface DatumConflict {
  /** Monday's live Datum-volgende-actie op het moment van de precheck. */
  mondayDatum: string;
  /** De datum die deze beslissing net probeerde te gebruiken (voorstel of aangepaste waarde). */
  salesDatum: string;
}

export interface BeslisResultaat {
  proposalId: number;
  actionId?: number;
  writeback?: WriteBackResultaat;
  /**
   * Gezet i.p.v. actionId/writeback: de lokale Sales-datum en Monday's live
   * Datum volgende actie verschillen. Nog GEEN sales-actions-record
   * aangemaakt, nog GEEN write-back geprobeerd — vereist een expliciete
   * herhaalde aanroep met bevestigdeMondayDatum (zie BeslisOpties hierboven)
   * vóór er iets wordt vastgelegd. Nooit stilzwijgend één datum laten winnen
   * (opdrachtseis).
   */
  datumconflict?: DatumConflict;
}

type ActieType = "mail" | "bellen" | "afspraak" | "voorbereiding" | "informatie_sturen" | "anders";
type Kanaal = "mail" | "telefoon" | "in_persoon" | "anders";

interface SalesProposalRecord {
  id: number;
  school: number | { id: number };
  status: string;
  proposalType: "volgende_actie" | "veld_correctie" | "bestaande_vervolgdatum";
  proposalText: string;
  proposedDate?: string | null;
  proposedType?: ActieType | null;
  proposedChannel?: Kanaal | null;
  proposedValue?: string | null;
  mondayValueAtProposalTime?: string | null;
}

interface SalesSchoolRecord {
  id: number;
  mondayItemId: string;
}

function schoolIdVan(voorstel: SalesProposalRecord): number {
  return typeof voorstel.school === "number" ? voorstel.school : voorstel.school.id;
}

export async function beslisOverVoorstel(payload: Payload, proposalId: number, opties: BeslisOpties): Promise<BeslisResultaat> {
  const voorstel = (await payload.findByID({
    collection: "sales-proposals",
    id: proposalId,
    overrideAccess: true,
    depth: 0,
  })) as unknown as SalesProposalRecord;
  if (!voorstel) throw new Error("Voorstel niet gevonden.");
  if (voorstel.status !== "pending" && voorstel.status !== "conflict") {
    throw new Error("Dit voorstel is al afgehandeld.");
  }

  const schoolId = schoolIdVan(voorstel);
  const school = (await payload.findByID({
    collection: "sales-schools",
    id: schoolId,
    overrideAccess: true,
    depth: 0,
  })) as unknown as SalesSchoolRecord;
  if (!school) throw new Error("Bijbehorende school niet gevonden.");

  if (opties.beslissing === "rejected") {
    await payload.update({
      collection: "sales-proposals",
      id: proposalId,
      data: { status: "rejected", decidedBy: opties.gebruikerId, decidedAt: new Date().toISOString() },
      overrideAccess: true,
    });
    await payload.create({
      collection: "sales-log-events",
      data: {
        school: schoolId,
        occurredAt: new Date().toISOString(),
        type: "ai_voorstel",
        source: "gebruiker",
        summary: `Voorstel afgewezen: ${voorstel.proposalText}`,
        actor: opties.gebruikerId,
        relatedProposal: proposalId,
      },
      overrideAccess: true,
    });
    return { proposalId };
  }

  const finalChoice = opties.beslissing === "modified" ? (opties.aangepasteWaarde ?? {}) : null;

  if (voorstel.proposalType === "veld_correctie") {
    const finaleWaarde = finalChoice?.proposedValue ?? voorstel.proposedValue;
    if (!finaleWaarde) throw new Error("Geen waarde bekend om terug te schrijven.");

    await payload.update({
      collection: "sales-proposals",
      id: proposalId,
      data: { status: opties.beslissing, finalChoice: finalChoice as Record<string, unknown> | null, decidedBy: opties.gebruikerId, decidedAt: new Date().toISOString() },
      overrideAccess: true,
    });

    const writeback = await schrijfTypeSchoolTerug(
      payload,
      school.id,
      school.mondayItemId,
      finaleWaarde,
      voorstel.mondayValueAtProposalTime ?? null,
      opties.gebruikerId,
      proposalId
    );
    if (writeback.status === "conflict") {
      await payload.update({ collection: "sales-proposals", id: proposalId, data: { status: "conflict" }, overrideAccess: true });
    }
    return { proposalId, writeback };
  }

  // "volgende_actie" of "bestaande_vervolgdatum" → resulteert in een sales-actions-record.
  const dueDate = finalChoice?.proposedDate ?? voorstel.proposedDate;
  if (!dueDate) throw new Error("Geen datum bekend voor deze actie.");
  const type = finalChoice?.proposedType ?? voorstel.proposedType ?? "anders";
  const channel = finalChoice?.proposedChannel ?? voorstel.proposedChannel ?? undefined;

  // Datumconflict-precheck (punt 12) — vóórdat er ooit een lokale
  // sales-actions-record bestaat: is Monday's live vervolgdatum inmiddels
  // een ANDERE dan wat hier zou worden vastgelegd? Alleen overslaan wanneer
  // dit al een bevestigde, eerder getoonde keuze is (opties.bevestigdeMondayDatum
  // gezet) — anders zou elke conflictoplossing zichzelf opnieuw blokkeren.
  // Kan de precheck zelf niet lezen (Monday tijdelijk onbereikbaar)? Dan NIET
  // de hele acceptatie blokkeren — het generieke read-conflict-write-pad in
  // schrijfDatumVolgendeActieTerug hieronder blijft de echte, laatste
  // vangnet-controle (zelfde degradatiefilosofie als de rest van dit
  // bestand: een write-back-probleem mag nooit de kernactie tegenhouden).
  if (opties.bevestigdeMondayDatum === undefined) {
    try {
      const mondayDatum = await leesActueleVolgendeActieDatum(school.mondayItemId);
      if (mondayDatum && mondayDatum !== dueDate) {
        return { proposalId, datumconflict: { mondayDatum, salesDatum: dueDate } };
      }
    } catch {
      // Precheck kon niet lezen — negeren, doorgaan als hieronder.
    }
  }

  const actie = await payload.create({
    collection: "sales-actions",
    data: {
      school: schoolId,
      type,
      description: voorstel.proposalText,
      dueDate,
      channel,
      sourceProposal: proposalId,
      createdBy: opties.gebruikerId,
      status: "open",
    },
    overrideAccess: true,
  });

  await payload.update({
    collection: "sales-proposals",
    id: proposalId,
    data: {
      status: opties.beslissing,
      finalChoice: finalChoice as Record<string, unknown> | null,
      decidedBy: opties.gebruikerId,
      decidedAt: new Date().toISOString(),
      resultingAction: actie.id,
    },
    overrideAccess: true,
  });

  await payload.create({
    collection: "sales-log-events",
    data: {
      school: schoolId,
      occurredAt: new Date().toISOString(),
      type: "actie_gepland",
      source: "gebruiker",
      summary: `${opties.beslissing === "modified" ? "Aangepast geaccepteerd" : "Geaccepteerd"}: ${voorstel.proposalText}`,
      actor: opties.gebruikerId,
      relatedAction: actie.id,
      relatedProposal: proposalId,
    },
    overrideAccess: true,
  });

  // Datum volgende actie: automatisch, geen aparte bevestiging (bevestigd) —
  // maar altijd via het generieke read-conflict-write-log-pad, dat een
  // inmiddels-andere Monday-waarde nooit stilzwijgend overschrijft. Bij een
  // zojuist opgeloste datumconflict-keuze wordt de tóén getoonde Monday-
  // waarde meegegeven als bevestigde basislijn (zie schrijfDatumVolgendeActieTerug).
  const writeback = await schrijfDatumVolgendeActieTerug(
    payload,
    school.id,
    school.mondayItemId,
    dueDate,
    opties.gebruikerId,
    proposalId,
    actie.id as number,
    opties.bevestigdeMondayDatum
  );

  return { proposalId, actionId: actie.id as number, writeback };
}

// Relatie-analyse V1.1 (2026-08-15) — gedeelde "vervang voorstel"-primitief
// voor "Opnieuw analyseren" (lib/sales/proposal-reanalyze.ts) EN "Bespreek
// met AI → Maak hiervan nieuw voorstel" (lib/sales/proposal-chat.ts): een
// oud voorstel wordt NOOIT overschreven — het krijgt status "superseded",
// het nieuwe voorstel wijst er via `supersedes` naar terug. Beide bestaande
// records blijven dus staan (auditeerbaarheid), zelfde principe als
// `finalChoice` hierboven. Callers zijn zelf verantwoordelijk voor de
// voorafgaande check "is het oude voorstel nog pending/conflict?" (zelfde
// verantwoordelijkheidsverdeling als beslisOverVoorstel hierboven) — dit
// voorkomt dat twee gelijktijdige acties (bv. iemand accepteert het oude
// voorstel terwijl een collega "Opnieuw analyseren" draait) een dubbel
// pending voorstel opleveren.
export interface VervangVoorstelData {
  school: number;
  proposalType: "volgende_actie";
  proposalText: string;
  reason: string;
  proposedDate: string | null;
  proposedType: ActieType | null;
  proposedChannel: Kanaal | null;
  confidence: "hoog" | "middel" | "laag";
  sourceUpdateIds?: { updateId: string }[];
  relatieAnalyse?: Record<string, unknown>;
  overlegGeschiedenis?: Record<string, unknown>[];
}

export interface VervangVoorstelOpties {
  oudProposalId: number;
  nieuwVoorstel: VervangVoorstelData;
  actorId: number;
  logSamenvatting: string;
}

export async function vervangVoorstel(payload: Payload, opties: VervangVoorstelOpties): Promise<{ nieuwProposalId: number }> {
  const nieuw = await payload.create({
    collection: "sales-proposals",
    data: { ...opties.nieuwVoorstel, supersedes: opties.oudProposalId, status: "pending" },
    overrideAccess: true,
  });

  await payload.update({
    collection: "sales-proposals",
    id: opties.oudProposalId,
    data: { status: "superseded" },
    overrideAccess: true,
  });

  await payload.create({
    collection: "sales-log-events",
    data: {
      school: opties.nieuwVoorstel.school,
      occurredAt: new Date().toISOString(),
      type: "ai_voorstel",
      source: "sales-ai",
      summary: opties.logSamenvatting,
      actor: opties.actorId,
      relatedProposal: nieuw.id,
    },
    overrideAccess: true,
  });

  return { nieuwProposalId: nieuw.id as number };
}
