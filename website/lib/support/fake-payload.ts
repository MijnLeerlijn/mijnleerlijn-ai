import type { Payload } from "payload";

// Minimale in-memory Payload-nabootsing, uitsluitend voor de tests van
// analyze.ts/run-analysis.ts (zie de .test.ts-bestanden in deze map) — geen
// echte database nodig om create/update/find/findByID-gedrag te verifiëren.
// Bewust hier als losse module i.p.v. in elk testbestand gedupliceerd, want
// zowel analyze.test.ts als run-analysis.test.ts hebben 'm nodig.

interface FakeDoc {
  id: number;
  [key: string]: unknown;
}

export interface FakePayload {
  payload: Payload;
  collection(naam: string): FakeDoc[];
}

export function maakFakePayload(seed: {
  "support-threads"?: FakeDoc[];
  "knowledge-drafts"?: FakeDoc[];
  articles?: FakeDoc[];
}): FakePayload {
  const data: Record<string, FakeDoc[]> = {
    "support-threads": seed["support-threads"] ?? [],
    "knowledge-drafts": seed["knowledge-drafts"] ?? [],
    articles: seed.articles ?? [],
  };
  let volgendId = 1000;

  // data heeft altijd exact deze drie sleutels (hierboven ingevuld) — deze
  // helper bestaat alleen om noUncheckedIndexedAccess tevreden te stellen.
  function arr(naam: string): FakeDoc[] {
    return data[naam] ?? (data[naam] = []);
  }

  function matchWaar(doc: FakeDoc, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([veld, voorwaarde]) => {
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
    find: async (opts: {
      collection: string;
      where?: Record<string, unknown>;
      sort?: string;
      limit?: number;
    }) => {
      let docs = arr(opts.collection).filter((d) => matchWaar(d, opts.where));
      if (opts.sort === "-lastMessageAt") {
        docs = [...docs].sort(
          (a, b) =>
            new Date(b.lastMessageAt as string).getTime() - new Date(a.lastMessageAt as string).getTime()
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
