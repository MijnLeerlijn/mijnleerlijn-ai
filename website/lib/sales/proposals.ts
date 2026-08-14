import type { Payload } from "payload";
import { schrijfDatumVolgendeActieTerug, schrijfTypeSchoolTerug, type WriteBackResultaat } from "./writeback";

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
}

export interface BeslisResultaat {
  proposalId: number;
  actionId?: number;
  writeback?: WriteBackResultaat;
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
  // inmiddels-andere Monday-waarde nooit stilzwijgend overschrijft.
  const writeback = await schrijfDatumVolgendeActieTerug(
    payload,
    school.id,
    school.mondayItemId,
    dueDate,
    opties.gebruikerId,
    proposalId,
    actie.id as number
  );

  return { proposalId, actionId: actie.id as number, writeback };
}
