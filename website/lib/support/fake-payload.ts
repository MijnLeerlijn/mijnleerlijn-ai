import type { Payload } from "payload";

// Minimale in-memory Payload-nabootsing — geen echte database nodig om
// create/update/find/findByID-gedrag te verifiëren. Gedeeld door zowel
// lib/support/*.test.ts (Gmail-analysesprint) als lib/knowledge/*.test.ts
// (Knowledge Sources-sprint), vandaar de generieke collectienaam-typering
// i.p.v. een vaste opsomming.

interface FakeDoc {
  id: number;
  [key: string]: unknown;
}

export interface FakePayload {
  payload: Payload;
  collection(naam: string): FakeDoc[];
}

export function maakFakePayload(seed: Record<string, FakeDoc[]>): FakePayload {
  const data: Record<string, FakeDoc[]> = { ...seed };
  let volgendId = 1000;

  // Onbekende collecties starten leeg — deze helper bestaat ook om
  // noUncheckedIndexedAccess tevreden te stellen.
  function arr(naam: string): FakeDoc[] {
    return data[naam] ?? (data[naam] = []);
  }

  // `and`/`or` ondersteund als eigen geval (Sprint 6: lib/embeddings/
  // similarity-search.ts en run-embedding.ts filteren knowledge-drafts/
  // articles met `where: { and: [...] }`) — zonder dit werd zo'n clause
  // stilzwijgend genegeerd (matchte alles), wat een test die deze filtering
  // daadwerkelijk moet bewijzen ten onrechte zou laten slagen.
  function matchWaar(doc: FakeDoc, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([veld, voorwaarde]) => {
      if (veld === "and" && Array.isArray(voorwaarde)) {
        return (voorwaarde as Record<string, unknown>[]).every((sub) => matchWaar(doc, sub));
      }
      if (veld === "or" && Array.isArray(voorwaarde)) {
        return (voorwaarde as Record<string, unknown>[]).some((sub) => matchWaar(doc, sub));
      }
      const waarde = doc[veld];
      if (voorwaarde && typeof voorwaarde === "object" && "equals" in voorwaarde) {
        return waarde === (voorwaarde as { equals: unknown }).equals;
      }
      if (voorwaarde && typeof voorwaarde === "object" && "in" in voorwaarde) {
        return (voorwaarde as { in: unknown[] }).in.includes(waarde);
      }
      return true;
    });
  }

  const payload = {
    // Sprint 6: lib/knowledge/sync-manuals.ts logt aantallen via
    // payload.logger — een no-op stub is genoeg, tests controleren gedrag,
    // niet logregels.
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    find: async (opts: {
      collection: string;
      where?: Record<string, unknown>;
      sort?: string;
      limit?: number;
    }) => {
      let docs = arr(opts.collection).filter((d) => matchWaar(d, opts.where));
      if (opts.sort?.startsWith("-")) {
        const veld = opts.sort.slice(1);
        docs = [...docs].sort(
          (a, b) => new Date(b[veld] as string).getTime() - new Date(a[veld] as string).getTime()
        );
      }
      if (opts.limit) docs = docs.slice(0, opts.limit);
      return { docs };
    },
    findByID: async (opts: { collection: string; id: number }) => {
      const doc = arr(opts.collection).find((d) => d.id === opts.id);
      if (!doc) throw new Error(`Niet gevonden: ${opts.collection}/${opts.id}`);
      return doc;
    },
    create: async (opts: { collection: string; data: Record<string, unknown> }) => {
      const doc: FakeDoc = { id: volgendId++, ...opts.data };
      arr(opts.collection).push(doc);
      return doc;
    },
    update: async (opts: { collection: string; id: number; data: Record<string, unknown> }) => {
      const doc = arr(opts.collection).find((d) => d.id === opts.id);
      if (!doc) throw new Error(`Niet gevonden: ${opts.collection}/${opts.id}`);
      Object.assign(doc, opts.data);
      return doc;
    },
  } as unknown as Payload;

  return {
    payload,
    collection: (naam: string) => arr(naam),
  };
}
