import type { Payload } from "payload";
import { vindScholenZonderVervolgactieGesplitst, type SchoolZonderVervolgactie } from "./aandacht-nodig";

// Sales UX-ronde 3 (2026-08-14) — datalaag voor de "To do"-tab op het
// algemene dashboard. Bewust GEEN nieuw takenmodel: alle items komen
// rechtstreeks uit de al bestaande sales-proposals (status pending/conflict
// dekt volgende_actie/veld_correctie/bestaande_vervolgdatum/write-back-
// conflicten zonder onderscheid) + de al bestaande
// vindScholenZonderVervolgactieGesplitst() (het "mogelijk afgesloten/
// inactief"-signaal — dezelfde set die eerder de widget-tier-4/"Aandacht
// nodig"-sectie voedde). "Laag"-vertrouwen AI-voorstellen blijven net als
// overal elders in Sales uit de UI (zie SalesProposals.ts se confidence-
// veldomschrijving) — hier via dezelfde confidence!=laag-queryfilter als
// SalesVandaagView.tsx.
//
// Productiecorrectie (2026-08-16, punt 8+13): twee root-cause-fixes.
// (1) de proposals-query filterde nooit op de school se relatiestatus — een
// school die NA het ontstaan van een voorstel Inactief/Gestopt werd, bleef
// gewoon in To-do staan. Nu client-side gefilterd op het al met depth:1
// meegeleverde school.actief (Lead/Prospect/Wacht op handtekening).
// (2) "mogelijk afgesloten" heette voorheen ook scholen met een geldige,
// niet-verlopen Monday-planning maar zonder lokaal record — die horen niet
// bij "aandacht nodig" (zie aandacht-nodig.ts se root-cause-comment). Nu
// apart als geplandInMonday, nooit vermengd met zonderVervolgactie.
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
  /** Écht zonder enige vervolgstap — verdient aandacht. */
  zonderVervolgactie: SchoolZonderVervolgactie[];
  /** Heeft al een niet-verlopen Monday-planning, alleen (nog) geen lokaal record — GEEN aandacht nodig. */
  geplandInMonday: SchoolZonderVervolgactie[];
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
  school: number | (TodoSchoolRef & { actief?: boolean });
}

export async function haalTodoItems(payload: Payload): Promise<TodoResultaat> {
  const [proposalsResultaat, aandacht] = await Promise.all([
    payload.find({
      collection: "sales-proposals",
      where: { status: { in: ["pending", "conflict"] }, confidence: { not_equals: "laag" } },
      sort: "-createdAt",
      limit: 500,
      depth: 1,
      overrideAccess: true,
    }),
    vindScholenZonderVervolgactieGesplitst(payload),
  ]);

  const proposals: TodoProposalItem[] = (proposalsResultaat.docs as unknown as SalesProposalDoc[])
    // Root cause punt 8: alleen scholen die nog actief zijn (Lead/Prospect/
    // Wacht op handtekening) horen in To-do — een pending voorstel voor een
    // inmiddels Inactief/Gestopt/Klant-zonder-actie school niet.
    .filter((p) => typeof p.school !== "number" && p.school.actief !== false)
    .map((p) => ({
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

  return {
    proposals,
    zonderVervolgactie: aandacht.zonderVervolgactie,
    geplandInMonday: aandacht.geplandInMonday,
  };
}
