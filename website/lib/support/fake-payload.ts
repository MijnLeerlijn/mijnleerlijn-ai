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

/**
 * Concurrencyfix (2026-08-24, lib/trainers/verslag.ts) — ontleedt een echte
 * drizzle sql\`...\`-template (NIET gemockt, alleen db.drizzle.execute()
 * hieronder is gefaked) terug tot matchbare SQL-tekst + de geïnterpoleerde
 * waarden op volgorde. Drizzle's SQL-object heeft geen publieke
 * "compileer zonder databaseverbinding"-methode, maar `queryChunks` is
 * stabiel en live tegen de geïnstalleerde drizzle-versie geverifieerd:
 * letterlijke tekstbrokken zijn `{value: string[]}`, sql.identifier(...) is
 * `{value: string}` (enkelvoudig, geen array — hier LETTERLIJK in de tekst
 * opgenomen, veilig: kolomnamen komen bij ELKE aanroeper hier altijd uit een
 * vaste, hardcoded call, nooit uit clientinvoer), en elke overige
 * geïnterpoleerde waarde verschijnt ongewrapt, hier als "?"-placeholder.
 * sql.join(...) (schrijfVerslagVelden se dynamische SET-opbouw) NEST een
 * eigen SQL-object per fragment (`{queryChunks: [...]}`) i.p.v. zijn eigen
 * chunks in de buitenste queryChunks te vlakken — live bevestigd, vandaar
 * hieronder recursief afgevlakt, anders zou zo'n geneste SQL als één
 * ondoorzichtige "param" worden behandeld i.p.v. als tekst+params.
 */
function ontleedRaweSql(query: { queryChunks: unknown[] }): { tekst: string; params: unknown[] } {
  let tekst = "";
  const params: unknown[] = [];
  function verwerk(chunks: unknown[]): void {
    for (const chunk of chunks) {
      if (chunk && typeof chunk === "object" && Array.isArray((chunk as { queryChunks?: unknown[] }).queryChunks)) {
        verwerk((chunk as { queryChunks: unknown[] }).queryChunks);
      } else if (chunk && typeof chunk === "object" && Array.isArray((chunk as { value?: unknown[] }).value)) {
        tekst += ((chunk as { value: string[] }).value).join("");
      } else if (chunk && typeof chunk === "object" && typeof (chunk as { value?: unknown }).value === "string") {
        tekst += (chunk as { value: string }).value;
      } else {
        params.push(chunk);
        tekst += "?";
      }
    }
  }
  verwerk(query.queryChunks);
  return { tekst, params };
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
      // Multi-brand variants (2026-07-30): `equals` op een hasMany-
      // relatieveld (bv. variantContext) betekent in de echte Payload-query
      // "bevat deze waarde", geen strikte gelijkheid — anders zou geen
      // enkele variant-scoping-test hier ooit kunnen matchen.
      if (voorwaarde && typeof voorwaarde === "object" && "equals" in voorwaarde) {
        const target = (voorwaarde as { equals: unknown }).equals;
        if (Array.isArray(waarde)) return waarde.some((v) => String(v) === String(target));
        return waarde === target;
      }
      if (voorwaarde && typeof voorwaarde === "object" && "in" in voorwaarde) {
        return (voorwaarde as { in: unknown[] }).in.includes(waarde);
      }
      // `exists: false` = leeg/niet gezet (undefined, null, of een lege
      // array bij een hasMany-relatieveld); `exists: true` het omgekeerde.
      if (voorwaarde && typeof voorwaarde === "object" && "exists" in voorwaarde) {
        const isLeeg = waarde === undefined || waarde === null || (Array.isArray(waarde) && waarde.length === 0);
        return (voorwaarde as { exists: boolean }).exists ? !isLeeg : isLeeg;
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
    findByID: async (opts: { collection: string; id: number; disableErrors?: boolean }) => {
      const doc = arr(opts.collection).find((d) => d.id === opts.id);
      if (!doc) {
        // AI Verbetercentrum: `disableErrors: true` geeft `undefined` terug
        // i.p.v. te gooien — zelfde optie als de echte Payload local API,
        // gebruikt door routes die zelf een nette 404 willen teruggeven.
        if (opts.disableErrors) return undefined;
        throw new Error(`Niet gevonden: ${opts.collection}/${opts.id}`);
      }
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
    // Concurrencyfix (2026-08-24) — lib/trainers/verslag.ts se atomische
    // claim-UPDATE's gaan via payload.db.drizzle.execute(sql`...`), niet via
    // payload.update() (zie de doc-comments daar voor de reden: alleen een
    // rauwe conditionele UPDATE is atomisch). Deze nabootsing herkent de
    // twee bekende queryvormen aan hun SQL-tekst en past exact dezelfde
    // voorwaarde toe als de echte SQL (WHERE-conditie eerst controleren,
    // dan pas schrijven) — bewust VOLLEDIG SYNCHROON tussen lezen en
    // schrijven (geen enkele `await` ertussen), zodat ook onder een
    // Promise.all() van twee "gelijktijdige" fake-aanroepen (die hier alleen
    // bij hun eigen `await`-punten interleaven, nooit daadwerkelijk parallel
    // in aparte OS-threads draaien) precies één aanroep de claim wint —
    // zelfde eigenschap als Postgres' rijvergrendeling, hier via JS' run-to-
    // completion-semantiek. Geen vervanging voor de echte, database-
    // afgedwongen garantie (zie de aparte real-Postgres-concurrencytests) —
    // uitsluitend hier zodat de bestaande, bredere fake-mock-testsuite voor
    // verslag.ts blijft werken bovenop de geclaimde schrijfroutes.
    db: {
      drizzle: {
        execute: async (query: { queryChunks: unknown[] }) => {
          const { tekst, params } = ontleedRaweSql(query);
          const verslagen = arr("training-verslagen");

          if (tekst.includes("SET definitieve_tekst")) {
            const [nieuweTekst, bevestigdOp, trainerNaam, id] = params as [string, string, string, number];
            const doc = verslagen.find((d) => d.id === id && d.status === "concept");
            if (!doc) return { rows: [] };
            Object.assign(doc, { definitieveTekst: nieuweTekst, bevestigdOp, status: "gedeeltelijk", bevestigdDoorTrainerNaam: trainerNaam });
            return { rows: [{ id }] };
          }

          const isTraining = tekst.includes("SET training_update_status = 'bezig'");
          const isSchool = tekst.includes("SET school_update_status = 'bezig'");
          if (isTraining || isSchool) {
            const [claimedAt, id, leaseSeconden] = params as [string, number, number];
            const statusVeld = isTraining ? "trainingUpdateStatus" : "schoolUpdateStatus";
            const claimedAtVeld = isTraining ? "trainingUpdateClaimedAt" : "schoolUpdateClaimedAt";
            const doc = verslagen.find((d) => d.id === id);
            if (!doc) return { rows: [] };
            const huidigeStatus = doc[statusVeld];
            const huidigeClaimedAt = doc[claimedAtVeld] as string | null | undefined;
            const leaseVerlopen =
              huidigeStatus === "bezig" &&
              typeof huidigeClaimedAt === "string" &&
              Date.now() - new Date(huidigeClaimedAt).getTime() > leaseSeconden * 1000;
            const claimbaar = huidigeStatus === "niet_verzonden" || huidigeStatus === "mislukt" || leaseVerlopen;
            if (!claimbaar) return { rows: [] };
            Object.assign(doc, { [statusVeld]: "bezig", [claimedAtVeld]: claimedAt });
            return { rows: [{ id }] };
          }

          // schrijfVerslagVelden (lib/trainers/verslag.ts) — dynamische,
          // willekeurige kolomcombinatie via sql.identifier(), hier dus ook
          // generiek nagebootst i.p.v. per-combinatie: kolomnamen staan al
          // LETTERLIJK in `tekst` (zie ontleedRaweSql), alleen de waarden
          // zijn "?"-placeholders. Laatste param is altijd het rij-ID (de
          // WHERE id = ?-clausule staat hier bewust ALTIJD als laatste).
          const setMatch = /^UPDATE training_verslagen SET (.+) WHERE id = \?;$/.exec(tekst);
          if (setMatch) {
            const kolomNamen = [...setMatch[1]!.matchAll(/(\w+) = \?/g)].map((m) => m[1]!);
            const id = params[params.length - 1] as number;
            const doc = verslagen.find((d) => d.id === id);
            if (!doc) return { rows: [] };
            kolomNamen.forEach((snakeCase, i) => {
              const camelCase = snakeCase.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
              const waarde = params[i];
              // afronding_resultaat is de enige jsonb-kolom hier — de echte
              // Postgres-kolom rondt een JSON.stringify()-string vanzelf
              // terug naar een object (payload.findByID hierboven doet dat
              // ná een ECHTE write ook), dus nabootsen voor gedragsgelijkheid.
              doc[camelCase] = snakeCase === "afronding_resultaat" && typeof waarde === "string" ? JSON.parse(waarde) : waarde;
            });
            return { rows: [{ id }] };
          }

          throw new Error(`fake-payload: onbekende db.drizzle.execute()-query, geen nabootsing beschikbaar:\n${tekst}`);
        },
      },
    },
  } as unknown as Payload;

  return {
    payload,
    collection: (naam: string) => arr(naam),
  };
}
