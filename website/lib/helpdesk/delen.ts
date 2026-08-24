import type { Payload } from "payload";
import { genereerDeelToken, hashDeelToken } from "./deel-token";
import { bepaalPubliekeManualsVoorSnapshot, bepaalRelevanteStappenVoorSnapshot } from "./deel-snapshot";
import type { PublicManual, PublicStep } from "@/lib/assistant/process-public-question";

// Chat delen via URL (2026-08-24) — de enige plek die de collectie
// "gedeelde-chats" schrijft/leest. Zelfde architectuurpatroon als elke
// andere gevoelige collectie in dit project (TrainerBestanden,
// TrainerTelefonieOproepen, ContactSubmissions): de collectie zelf staat
// volledig dicht (create/update: () => false), en deze module is de enige
// plek die overrideAccess: true gebruikt, ná eigen verificatie hieronder.
//
// Bewust GEEN eigenaarscontrole op basis van een ingelogde gebruiker: de
// publieke Helpdesk-chat heeft er zelf geen (zie
// lib/assistant/process-public-question.ts — elk gesprek heeft user: null).
// De toegangsgrens hier is in plaats daarvan: uitsluitend conversationId's
// met source "helpdesk" zijn deelbaar — dit voorkomt dat het interne
// /assistant-scherm (dat WEL een eigenaar/login kent) via deze publieke
// deelroute zou kunnen lekken, ook al kent iemand toevallig een intern
// conversationId. Zelfde grens-redenering als app/api/helpdesk/feedback/
// route.ts hanteert voor exact hetzelfde probleem.

/** Defensieve bovengrens (zelfde principe als elders in dit project — "vermijd onbegrensde queries/opslag"). */
export const MAX_BERICHTEN_PER_DEELLINK = 50;

export interface GedeeldBericht {
  vraag: string;
  antwoord: string;
  manuals: PublicManual[];
  steps: PublicStep[];
}

export type MaakDeelLinkUitkomst =
  | { soort: "ok"; token: string }
  | { soort: "leeg" }
  | { soort: "te_veel_berichten" }
  | { soort: "geen_geldige_conversaties" };

interface StoredSource {
  refCollection?: string | null;
  refId?: number | null;
}
interface StoredStep {
  handleidingId?: number | null;
  stepId?: string | null;
  stepNummer?: number | null;
}

/**
 * Maakt een nieuwe deel-snapshot van de gegeven Helpdesk-conversationId's
 * (in de vorm waarin de client ze al kent uit /api/helpdesk/ask-responses).
 * Chronologisch gesorteerd op createdAt — NOOIT de door de client
 * aangeleverde arrayvolgorde vertrouwd, dat zou een niet-vertrouwde partij
 * de weergavevolgorde laten manipuleren.
 */
export async function maakDeelLink(payload: Payload, conversationIds: number[]): Promise<MaakDeelLinkUitkomst> {
  const uniekeIds = [...new Set(conversationIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (uniekeIds.length === 0) return { soort: "leeg" };
  if (uniekeIds.length > MAX_BERICHTEN_PER_DEELLINK) return { soort: "te_veel_berichten" };

  const resultaat = await payload.find({
    collection: "assistant-conversations",
    where: { id: { in: uniekeIds } },
    overrideAccess: true,
    depth: 0,
    limit: uniekeIds.length,
  });

  const helpdeskRecords = resultaat.docs.filter((d) => d.source === "helpdesk");
  if (helpdeskRecords.length !== uniekeIds.length) return { soort: "geen_geldige_conversaties" };

  helpdeskRecords.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const berichten: GedeeldBericht[] = [];
  for (const record of helpdeskRecords) {
    const sources = ((record.sources ?? []) as StoredSource[]).flatMap((s) =>
      typeof s.refCollection === "string" && typeof s.refId === "number" ? [{ refCollection: s.refCollection, refId: s.refId }] : []
    );
    const steps = ((record.steps ?? []) as StoredStep[]).flatMap((s) =>
      typeof s.handleidingId === "number" && typeof s.stepId === "string" && typeof s.stepNummer === "number"
        ? [{ handleidingId: s.handleidingId, stepId: s.stepId, stepNummer: s.stepNummer }]
        : []
    );

    const [manuals, stappen] = await Promise.all([
      bepaalPubliekeManualsVoorSnapshot(payload, sources),
      bepaalRelevanteStappenVoorSnapshot(payload, steps),
    ]);
    berichten.push({ vraag: record.question, antwoord: record.answer, manuals, steps: stappen });
  }

  const token = genereerDeelToken();
  await payload.create({
    collection: "gedeelde-chats",
    overrideAccess: true,
    data: {
      tokenHash: hashDeelToken(token),
      berichten: berichten.map((b) => ({
        vraag: b.vraag,
        antwoord: b.antwoord,
        manuals: b.manuals.map((m) => ({ manualId: m.id, title: m.title, hasFile: m.hasFile })),
        steps: b.steps.map((s) => ({
          handleidingId: s.handleidingId,
          handleidingSlug: s.handleidingSlug,
          handleidingTitel: s.handleidingTitel,
          handleidingUrl: s.handleidingUrl,
          stepId: s.stepId,
          stepNummer: s.stepNummer,
          titel: s.titel,
          uitleg: s.uitleg,
          images: s.images.map((img) => ({ url: img.url, caption: img.caption, alt: img.alt })),
        })),
      })),
      bronConversaties: helpdeskRecords.map((r) => r.id),
    },
  });

  return { soort: "ok", token };
}

export interface GedeeldeChatWeergave {
  berichten: GedeeldBericht[];
  gedeeldOp: string;
}

export type HaalGedeeldeChatUitkomst = { soort: "ok"; data: GedeeldeChatWeergave } | { soort: "niet_beschikbaar" };

interface StoredManual {
  manualId: number;
  title: string;
  hasFile: boolean | null;
}
interface StoredImage {
  url: string;
  caption?: string | null;
  alt: string;
}
interface StoredStepFull {
  handleidingId: number;
  handleidingSlug: string;
  handleidingTitel: string;
  handleidingUrl: string;
  stepId: string;
  stepNummer: number;
  titel: string;
  uitleg: string;
  images?: StoredImage[] | null;
}
interface StoredBericht {
  vraag: string;
  antwoord: string;
  manuals?: StoredManual[] | null;
  steps?: StoredStepFull[] | null;
}

/**
 * Publiek-veilige lezing van een gedeelde chat via de RUWE token (nooit de
 * hash zelf accepteren — die is er juist om de ruwe waarde geheim te
 * houden). Geeft UITSLUITEND weergavevelden terug — nooit tokenHash, nooit
 * bronConversaties/interne ID's, nooit een Payload-record-id.
 */
export async function haalGedeeldeChat(payload: Payload, ruweToken: string): Promise<HaalGedeeldeChatUitkomst> {
  const resultaat = await payload.find({
    collection: "gedeelde-chats",
    where: { tokenHash: { equals: hashDeelToken(ruweToken) } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  });
  const record = resultaat.docs[0];
  if (!record || record.revokedAt) return { soort: "niet_beschikbaar" };

  const berichten = ((record.berichten ?? []) as StoredBericht[]).map((b) => ({
    vraag: b.vraag,
    antwoord: b.antwoord,
    manuals: (b.manuals ?? []).map((m) => ({ id: m.manualId, title: m.title, hasFile: Boolean(m.hasFile) })),
    steps: (b.steps ?? []).map((s) => ({
      handleidingId: s.handleidingId,
      handleidingSlug: s.handleidingSlug,
      handleidingTitel: s.handleidingTitel,
      handleidingUrl: s.handleidingUrl,
      stepId: s.stepId,
      stepNummer: s.stepNummer,
      titel: s.titel,
      uitleg: s.uitleg,
      images: (s.images ?? []).map((img) => ({ url: img.url, caption: img.caption ?? undefined, alt: img.alt })),
    })),
  }));

  return { soort: "ok", data: { berichten, gedeeldOp: record.createdAt } };
}

export type TrekDeelLinkInUitkomst = "ingetrokken" | "niet_gevonden";

/** Idempotent: een al ingetrokken of nooit bestaan hebbende token levert hetzelfde resultaat op voor de aanroeper ("link werkt niet meer") — geen apart foutpad nodig. */
export async function trekDeelLinkIn(payload: Payload, ruweToken: string): Promise<TrekDeelLinkInUitkomst> {
  const resultaat = await payload.find({
    collection: "gedeelde-chats",
    where: { tokenHash: { equals: hashDeelToken(ruweToken) } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  });
  const record = resultaat.docs[0];
  if (!record || record.revokedAt) return "niet_gevonden";

  await payload.update({
    collection: "gedeelde-chats",
    id: record.id,
    overrideAccess: true,
    data: { revokedAt: new Date().toISOString() },
  });
  return "ingetrokken";
}
