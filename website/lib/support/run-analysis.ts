import type { Payload } from "payload";
import { analyseThread, type ThreadVoorAnalyse } from "./analyze";

// Orkestreert een analyseronde over meerdere threads — zie
// app/api/support/analyze/route.ts (de enige aanroeper). Verwerkt elke
// thread onafhankelijk (try/catch per thread) zodat één mislukte analyse de
// rest van de ronde niet blokkeert, en werkt de thread pas bij ná een
// afgeronde, gevalideerde uitkomst — nooit vooraf op "analyzed" gezet.

export const STANDAARD_LIMIET = 5;
const HARDE_MAX_LIMIET = 25; // zelfde orde van grootte als de Gmail-sync-cap, voorkomt een dure ronde per ongeluk

export interface AnalyseSamenvatting {
  geanalyseerd: number;
  conceptenGemaakt: number;
  bestaandeConceptenBijgewerkt: number;
  genegeerd: number;
  mislukt: number;
  fouten: string[];
}

interface OpgeslagenBericht {
  gmailMessageId: string;
  from: string;
  sentAt: string;
  bodyText: string;
}

async function selecteerThreads(
  payload: Payload,
  threadIds: number[] | undefined,
  limiet: number
): Promise<ThreadVoorAnalyse[]> {
  if (threadIds && threadIds.length > 0) {
    const beperkt = threadIds.slice(0, HARDE_MAX_LIMIET);
    const docs = await Promise.all(
      beperkt.map((id) => payload.findByID({ collection: "support-threads", id, overrideAccess: true }))
    );
    return docs.map(naarThreadVoorAnalyse);
  }

  const resultaat = await payload.find({
    collection: "support-threads",
    where: { aiAnalysisStatus: { in: ["not-analyzed", "failed"] } },
    sort: "-lastMessageAt",
    limit: Math.min(limiet, HARDE_MAX_LIMIET),
    overrideAccess: true,
  });
  return resultaat.docs.map(naarThreadVoorAnalyse);
}

function naarThreadVoorAnalyse(doc: {
  id: number;
  subject?: string | null;
  messages?: unknown;
}): ThreadVoorAnalyse {
  return {
    id: doc.id,
    subject: doc.subject ?? "(geen onderwerp)",
    messages: ((doc.messages ?? []) as OpgeslagenBericht[]).map((m) => ({
      gmailMessageId: m.gmailMessageId,
      from: m.from,
      sentAt: m.sentAt,
      bodyText: m.bodyText,
    })),
  };
}

export async function runSupportAnalysis(
  payload: Payload,
  opties: { threadIds?: number[]; limiet?: number }
): Promise<AnalyseSamenvatting> {
  const threads = await selecteerThreads(payload, opties.threadIds, opties.limiet ?? STANDAARD_LIMIET);

  const samenvatting: AnalyseSamenvatting = {
    geanalyseerd: 0,
    conceptenGemaakt: 0,
    bestaandeConceptenBijgewerkt: 0,
    genegeerd: 0,
    mislukt: 0,
    fouten: [],
  };

  for (const thread of threads) {
    try {
      await payload.update({
        collection: "support-threads",
        id: thread.id,
        overrideAccess: true,
        data: { aiAnalysisStatus: "analyzing" },
      });

      const uitkomst = await analyseThread(payload, thread);
      samenvatting.geanalyseerd += 1;

      if (uitkomst.type === "failed") {
        samenvatting.mislukt += 1;
        samenvatting.fouten.push(`Thread ${thread.id}: ${uitkomst.foutmelding}`);
        await payload.update({
          collection: "support-threads",
          id: thread.id,
          overrideAccess: true,
          data: { aiAnalysisStatus: "failed", aiAnalysisError: uitkomst.foutmelding },
        });
        continue;
      }

      if (uitkomst.type === "ignored") {
        samenvatting.genegeerd += 1;
        await payload.update({
          collection: "support-threads",
          id: thread.id,
          overrideAccess: true,
          data: {
            aiAnalysisStatus: "ignored",
            aiAnalysisError: uitkomst.reden,
            analyzedAt: new Date().toISOString(),
          },
        });
        continue;
      }

      if (uitkomst.type === "created") samenvatting.conceptenGemaakt += 1;
      if (uitkomst.type === "updated") samenvatting.bestaandeConceptenBijgewerkt += 1;

      const bestaandeThread = await payload.findByID({
        collection: "support-threads",
        id: thread.id,
        overrideAccess: true,
        depth: 0,
      });
      const bestaandeDrafts = ((bestaandeThread.knowledgeDrafts ?? []) as (number | { id: number })[]).map(
        (d) => (typeof d === "number" ? d : d.id)
      );

      await payload.update({
        collection: "support-threads",
        id: thread.id,
        overrideAccess: true,
        data: {
          aiAnalysisStatus: "analyzed",
          aiAnalysisError: null,
          analyzedAt: new Date().toISOString(),
          knowledgeDrafts: [...new Set([...bestaandeDrafts, uitkomst.draftId])],
        },
      });
    } catch (error) {
      const boodschap = error instanceof Error ? error.message : String(error);
      samenvatting.mislukt += 1;
      samenvatting.fouten.push(`Thread ${thread.id}: onverwachte fout — ${boodschap}`);
      await payload
        .update({
          collection: "support-threads",
          id: thread.id,
          overrideAccess: true,
          data: { aiAnalysisStatus: "failed", aiAnalysisError: `Onverwachte fout: ${boodschap}` },
        })
        .catch(() => undefined);
    }
  }

  return samenvatting;
}
