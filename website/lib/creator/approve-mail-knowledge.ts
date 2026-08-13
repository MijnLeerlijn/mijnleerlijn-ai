import type { Payload } from "payload";

// Creator V1 (2026-08-13) — het daadwerkelijke opslaan ná goedkeuring van
// een via "Maak hier een kennisstuk van" voorgesteld kennisstuk (zie
// mail-to-knowledge.ts, dat bewust niets persisteert — "mens keurt goed
// vóór het kennis wordt"). KnowledgeDrafts.access.create is `() => false`
// (nooit via de publieke REST-API, zie dat collectiebestand) — deze functie
// is de enige plek die met overrideAccess: true een kennisstuk aanmaakt
// vanuit de Creator-mailflow, aangeroepen door
// app/api/creator/approve-knowledge-draft/route.ts (ná de eigen
// isAdmin-controle daar — MailDrafts.linkedKnowledgeDraft is zelf ook al
// adminFieldOnly, dezelfde grens).
export interface ApproveMailKnowledgeOpties {
  mailDraftId: number;
  title: string;
  question: string;
  shortAnswer: string;
  fullAnswer: string;
  customerSpecificInformationFound: boolean;
  customerSpecificInformationExplanation?: string;
}

export async function keurMailKennisstukGoed(payload: Payload, opties: ApproveMailKnowledgeOpties): Promise<{ id: number }> {
  const kennisstuk = await payload.create({
    collection: "knowledge-drafts",
    overrideAccess: true,
    draft: false,
    data: {
      title: opties.title,
      question: opties.question,
      shortAnswer: opties.shortAnswer,
      fullAnswer: opties.fullAnswer,
      confidenceScore: 60,
      customerSpecificInformationFound: opties.customerSpecificInformationFound,
      customerSpecificInformationExplanation: opties.customerSpecificInformationExplanation,
      status: "review",
      origin: "creator-mail",
      sourceMailDraft: opties.mailDraftId,
      embeddingStatus: "pending",
    },
  });

  await payload.update({
    collection: "mail-drafts",
    id: opties.mailDraftId,
    overrideAccess: true,
    data: { linkedKnowledgeDraft: kennisstuk.id, status: "afgehandeld" },
  });

  return { id: Number(kennisstuk.id) };
}
