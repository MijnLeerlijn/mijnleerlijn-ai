import type { Payload } from "payload";
import { refreshAccessToken } from "./oauth";
import { encrypt, decrypt } from "./encryption";
import { listThreadIds, fetchFullThread } from "./api";

// Orkestreert een Gmail-synchronisatieronde — zie app/api/gmail/sync/route.ts
// (de enige aanroeper). Eerste, bewust beperkte versie: vaste query, vast
// maximum, geen bijlagen, geen AI-analyse, geen achtergrondtaak/cron (zie de
// opdracht) — uitsluitend het ophalen en veilig wegschrijven zelf.

const SYNC_QUERY = "newer_than:2y";
const MAX_THREADS = 25;
// Ruime marge vóór de daadwerkelijke expiry, zodat een langlopende sync nooit
// halverwege op een net-verlopen token loopt.
const TOKEN_REFRESH_BUFFER_MS = 60_000;

export interface SyncSamenvatting {
  gevonden: number;
  nieuw: number;
  bijgewerkt: number;
  overgeslagen: number;
  mislukt: number;
  fouten: string[];
}

interface OpgeslagenBericht {
  gmailMessageId: string;
}

/** Geeft een geldig access token terug, en vernieuwt + slaat het versleuteld op wanneer het (bijna) verlopen is. */
async function verkrijgGeldigAccessToken(payload: Payload): Promise<string> {
  const connection = await payload.findGlobal({ slug: "gmail-connection", overrideAccess: true });

  if (!connection?.encryptedAccessToken || !connection?.encryptedRefreshToken) {
    throw new Error("Geen actieve Gmail-koppeling gevonden — koppel eerst via /api/gmail/oauth/start.");
  }

  const verlooptOp = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : 0;
  if (Date.now() < verlooptOp - TOKEN_REFRESH_BUFFER_MS) {
    return decrypt(connection.encryptedAccessToken);
  }

  const refreshToken = decrypt(connection.encryptedRefreshToken);
  const vernieuwd = await refreshAccessToken(refreshToken);

  await payload.updateGlobal({
    slug: "gmail-connection",
    overrideAccess: true,
    data: {
      encryptedAccessToken: encrypt(vernieuwd.access_token),
      tokenExpiresAt: new Date(Date.now() + vernieuwd.expires_in * 1000).toISOString(),
    },
  });

  return vernieuwd.access_token;
}

/**
 * Haalt maximaal MAX_THREADS threads op (query: SYNC_QUERY), en maakt/werkt
 * bij in de support-threads-collectie. gmailThreadId voorkomt dubbele import
 * (payload/collections/SupportThreads.ts); een bestaande thread met nieuwe
 * berichten wordt aangevuld, nooit overschreven of leeggemaakt.
 */
export async function syncGmailThreads(payload: Payload): Promise<SyncSamenvatting> {
  const resultaat: SyncSamenvatting = {
    gevonden: 0,
    nieuw: 0,
    bijgewerkt: 0,
    overgeslagen: 0,
    mislukt: 0,
    fouten: [],
  };

  const accessToken = await verkrijgGeldigAccessToken(payload);
  const threadIds = await listThreadIds(accessToken, SYNC_QUERY, MAX_THREADS);
  resultaat.gevonden = threadIds.length;

  for (const threadId of threadIds) {
    try {
      const thread = await fetchFullThread(accessToken, threadId);

      const bestaand = await payload.find({
        collection: "support-threads",
        where: { gmailThreadId: { equals: thread.gmailThreadId } },
        limit: 1,
        overrideAccess: true,
      });
      const bestaandDoc = bestaand.docs[0];

      if (!bestaandDoc) {
        await payload.create({
          collection: "support-threads",
          overrideAccess: true,
          data: {
            gmailThreadId: thread.gmailThreadId,
            subject: thread.subject,
            participants: thread.participants,
            firstMessageAt: thread.firstMessageAt,
            lastMessageAt: thread.lastMessageAt,
            messageCount: thread.messageCount,
            snippet: thread.snippet,
            messages: thread.messages,
            status: "new",
            importedAt: new Date().toISOString(),
            updatedFromGmailAt: new Date().toISOString(),
            aiAnalysisStatus: "not-analyzed",
          },
        });
        resultaat.nieuw += 1;
        continue;
      }

      const bekendeIds = new Set(
        ((bestaandDoc.messages ?? []) as OpgeslagenBericht[]).map((m) => m.gmailMessageId)
      );
      const nieuweBerichten = thread.messages.filter((m) => !bekendeIds.has(m.gmailMessageId));

      if (nieuweBerichten.length === 0) {
        resultaat.overgeslagen += 1;
        continue;
      }

      await payload.update({
        collection: "support-threads",
        id: bestaandDoc.id,
        overrideAccess: true,
        data: {
          participants: thread.participants,
          lastMessageAt: thread.lastMessageAt,
          messageCount: thread.messageCount,
          snippet: thread.snippet,
          messages: [...(bestaandDoc.messages ?? []), ...nieuweBerichten],
          updatedFromGmailAt: new Date().toISOString(),
        },
      });
      resultaat.bijgewerkt += 1;
    } catch (error) {
      resultaat.mislukt += 1;
      const boodschap = error instanceof Error ? error.message : String(error);
      resultaat.fouten.push(`${threadId}: ${boodschap}`);
    }
  }

  await payload.updateGlobal({
    slug: "gmail-connection",
    overrideAccess: true,
    data: { lastSyncAt: new Date().toISOString() },
  });

  return resultaat;
}
