import type { Payload } from "payload";
import { vindActieveScholenZonderVervolgactie, type SchoolZonderVervolgactie } from "./aandacht-nodig";

// Sales UX-ronde 3 (2026-08-14) — datalaag voor de "To do"-tab op het
// algemene dashboard. Bewust GEEN nieuw takenmodel: alle items komen
// rechtstreeks uit de al bestaande sales-proposals (status pending/conflict
// dekt volgende_actie/veld_correctie/bestaande_vervolgdatum/write-back-
// conflicten zonder onderscheid) + de al bestaande
// vindActieveScholenZonderVervolgactie() (het "mogelijk afgesloten/
// inactief"-signaal — dezelfde set die eerder de widget-tier-4/"Aandacht
// nodig"-sectie voedde). "Laag"-vertrouwen AI-voorstellen blijven net als
// overal elders in Sales uit de UI (zie SalesProposals.ts se confidence-
// veldomschrijving) — hier via dezelfde confidence!=laag-queryfilter als
// SalesVandaagView.tsx.
export interface TodoSchoolRef {
  id: number;
  schoolName: string;
  relatiestatus: string | null;
  plaats: string | null;
}

export interface TodoProposalItem {
  id: number;
  proposalText: string;
  reason: string | null;
  proposalType: "volgende_actie" | "veld_correctie" | "bestaande_vervolgdatum";
  confidence: "hoog" | "middel" | "laag" | null;
  status: "pending" | "conflict";
  proposedValue: string | null;
  targetColumnId: string | null;
  // Relatie-analyse V1.1 (2026-08-15) — nodig zodat SalesProposalActies'
  // "Aanpassen"-formulier (SalesAanpasFormulier) op het dashboard hetzelfde
  // kan voorinvullen als op schooldetail/Overzicht.
  proposedDate: string | null;
  proposedType: string | null;
  proposedChannel: string | null;
  school: TodoSchoolRef;
}

export interface TodoResultaat {
  proposals: TodoProposalItem[];
  mogelijkAfgeslotenScholen: SchoolZonderVervolgactie[];
}

function schoolRef(waarde: number | TodoSchoolRef): TodoSchoolRef {
  return typeof waarde === "number" ? { id: waarde, schoolName: `School #${waarde}`, relatiestatus: null, plaats: null } : waarde;
}

interface SalesProposalDoc {
  id: number;
  proposalText: string;
  reason?: string | null;
  proposalType: "volgende_actie" | "veld_correctie" | "bestaande_vervolgdatum";
  confidence?: "hoog" | "middel" | "laag" | null;
  status: "pending" | "conflict";
  proposedValue?: string | null;
  targetColumnId?: string | null;
  proposedDate?: string | null;
  proposedType?: string | null;
  proposedChannel?: string | null;
  school: number | TodoSchoolRef;
}

export async function haalTodoItems(payload: Payload): Promise<TodoResultaat> {
  const [proposalsResultaat, mogelijkAfgeslotenScholen] = await Promise.all([
    payload.find({
      collection: "sales-proposals",
      where: { status: { in: ["pending", "conflict"] }, confidence: { not_equals: "laag" } },
      sort: "-createdAt",
      limit: 500,
      depth: 1,
      overrideAccess: true,
    }),
    vindActieveScholenZonderVervolgactie(payload),
  ]);

  const proposals: TodoProposalItem[] = (proposalsResultaat.docs as unknown as SalesProposalDoc[]).map((p) => ({
    id: p.id,
    proposalText: p.proposalText,
    reason: p.reason ?? null,
    proposalType: p.proposalType,
    confidence: p.confidence ?? null,
    status: p.status,
    proposedValue: p.proposedValue ?? null,
    targetColumnId: p.targetColumnId ?? null,
    proposedDate: p.proposedDate ?? null,
    proposedType: p.proposedType ?? null,
    proposedChannel: p.proposedChannel ?? null,
    school: schoolRef(p.school),
  }));

  return { proposals, mogelijkAfgeslotenScholen };
}
