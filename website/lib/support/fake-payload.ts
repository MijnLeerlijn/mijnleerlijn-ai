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
      // Gate 1 (telefonie-onderhoudsronde, 2026-08-25) — vindOnderhoudsKandidaten
      // filtert op "volgendeTranscriptiepoging <= nu" resp. "updatedAt <
      // vastgelopen-drempel". String-vergelijking is hier veilig: alle
      // datums komen consequent als ISO-8601 binnen (new Date().toISOString()),
      // wat lexicografisch dezelfde volgorde geeft als chronologisch.
      if (voorwaarde && typeof voorwaarde === "object" && "less_than_equal" in voorwaarde) {
        if (waarde === undefined || waarde === null) return false;
        return String(waarde) <= String((voorwaarde as { less_than_equal: unknown }).less_than_equal);
      }
      if (voorwaarde && typeof voorwaarde === "object" && "less_than" in voorwaarde) {
        if (waarde === undefined || waarde === null) return false;
        return String(waarde) < String((voorwaarde as { less_than: unknown }).less_than);
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
      // Traineromgeving V2 (2026-08-28) — totalDocs vóór de limit-slice
      // bepaald, zelfde semantiek als de echte Payload local API (totalDocs
      // is het volledige aantal matches, ongeacht paginagrootte) — nodig
      // voor lib/trainers/verslag.ts se telVoltooideVerslagen (een goedkope
      // telling via limit:1 + totalDocs, geen N-voudige documentophaling).
      const totalDocs = docs.length;
      if (opts.limit) docs = docs.slice(0, opts.limit);
      return { docs, totalDocs };
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
    // Ronde 3.5 (telefonie) — lib/trainers/verslag.ts se verwijderConcept()
    // is de eerste aanroeper van payload.delete() in dit bestand.
    delete: async (opts: { collection: string; id: number }) => {
      const lijst = arr(opts.collection);
      const index = lijst.findIndex((d) => d.id === opts.id);
      if (index === -1) throw new Error(`Niet gevonden: ${opts.collection}/${opts.id}`);
      const [doc] = lijst.splice(index, 1);
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

          // Ronde 3.5 (telefonie) — claimOpnameVerwerking se atomische
          // conditionele UPDATE (lib/trainers/telefonie/oproep-state.ts):
          // zelfde claimprincipe als training_update_status/school_update_
          // status hierboven, maar op trainer_telefonie_oproepen, met een
          // vaste doelstatus i.p.v. een "bezig"-lease (Twilio's
          // recordingStatusCallback komt nooit gelijktijdig-parallel binnen,
          // wél soms herhaald ná de eerste, al-verwerkte aanroep — vandaar
          // "claimbaar zolang er nog geen ANDERE recordingProviderId
          // geclaimd heeft", i.p.v. een tijd-gebaseerde lease). Slaat sinds
          // gate 1 ook opnameOphaalReferentie + updatedAt op, in dezelfde
          // atomische stap als de echte SQL.
          if (tekst.includes("SET status = 'opname_ontvangen'")) {
            const [recordingProviderId, ophaalReferentie, id] = params as [string, string | null, number, string];
            const oproepen = arr("trainer-telefonie-oproepen");
            const doc = oproepen.find((d) => d.id === id);
            if (!doc) return { rows: [] };
            const statusOk = doc.status === "training_gekozen" || doc.status === "opname_verwacht";
            const recordingOk = doc.recordingProviderId === undefined || doc.recordingProviderId === null || doc.recordingProviderId === recordingProviderId;
            if (!statusOk || !recordingOk) return { rows: [] };
            Object.assign(doc, { status: "opname_ontvangen", recordingProviderId, opnameOphaalReferentie: ophaalReferentie, updatedAt: new Date().toISOString() });
            return { rows: [{ id }] };
          }

          // Gate 1 (2026-08-25) — claimTranscriptieRetry se atomische
          // conditionele UPDATE: claimbaar vanuit twee categorieën, zie de
          // doc-comment bij die functie (oproep-state.ts) voor de volledige
          // toelichting. Zelfde claimprincipe, andere voorwaarde.
          if (tekst.includes("SET status = 'transcriptie_bezig'")) {
            const [id, vastgelopenVoorTijdstip] = params as [number, string];
            const oproepen = arr("trainer-telefonie-oproepen");
            const doc = oproepen.find((d) => d.id === id);
            if (!doc) return { rows: [] };
            const nu = new Date().toISOString();
            const volgendePogingKlaar = doc.status === "transcriptie_mislukt_herstelbaar" && typeof doc.volgendeTranscriptiepoging === "string" && doc.volgendeTranscriptiepoging <= nu;
            const vastgelopen =
              (doc.status === "opname_ontvangen" || doc.status === "transcriptie_bezig") &&
              typeof doc.updatedAt === "string" &&
              doc.updatedAt < vastgelopenVoorTijdstip;
            if (!volgendePogingKlaar && !vastgelopen) return { rows: [] };
            Object.assign(doc, { status: "transcriptie_bezig", updatedAt: nu });
            return { rows: [{ id }] };
          }

          // Productieregressie-vervolgronde (2026-08-27) —
          // claimAfsluitboodschap se atomische conditionele UPDATE: claimbaar
          // zolang de afsluitboodschap nog niet eerder gestart is
          // (afsluitboodschap_gestart_op IS NULL), bewust ONAFHANKELIJK van
          // het status-veld (zie de doc-comment bij de echte functie,
          // oproep-state.ts) — vandaar geen statuscontrole hier, in
          // tegenstelling tot de claims hierboven.
          if (tekst.includes("SET afsluitboodschap_gestart_op = now()")) {
            const [id] = params as [number];
            const oproepen = arr("trainer-telefonie-oproepen");
            const doc = oproepen.find((d) => d.id === id);
            if (!doc) return { rows: [] };
            if (doc.afsluitboodschapGestartOp != null) return { rows: [] };
            const nu = new Date().toISOString();
            Object.assign(doc, { afsluitboodschapGestartOp: nu, updatedAt: nu });
            return { rows: [{ id }] };
          }

          // Live regressie-vervolgronde (2026-08-27/28) —
          // claimOpnameToetsVerwerking se atomische conditionele UPDATE:
          // claimbaar zolang de opgegeven client_state nog niet de laatst
          // geclaimde waarde is — zie de doc-comment bij die functie
          // (oproep-state.ts) voor de volledige dedup-redenering.
          if (tekst.includes("SET opname_toets_claim_client_state")) {
            const [clientState, id] = params as [string, number, string];
            const oproepen = arr("trainer-telefonie-oproepen");
            const doc = oproepen.find((d) => d.id === id);
            if (!doc) return { rows: [] };
            if (doc.status !== "opname_verwacht") return { rows: [] };
            if (doc.opnameToetsClaimClientState != null && doc.opnameToetsClaimClientState === clientState) return { rows: [] };
            const nu = new Date().toISOString();
            Object.assign(doc, { opnameToetsClaimClientState: clientState, updatedAt: nu });
            return { rows: [{ id }] };
          }

          // schrijfVerslagVelden/schrijfOproepVelden — dynamische,
          // willekeurige kolomcombinatie via sql.identifier(), hier dus ook
          // generiek nagebootst i.p.v. per-combinatie: kolomnamen staan al
          // LETTERLIJK in `tekst` (zie ontleedRaweSql), alleen de waarden
          // zijn "?"-placeholders. Laatste param is altijd het rij-ID (de
          // WHERE id = ?-clausule staat hier bewust ALTIJD als laatste).
          // Tabelnaam (snake_case, gevangen als groep 1) -> Payload-
          // collectieslug (kebab-case) is voor beide huidige aanroepers
          // (training_verslagen/trainer_telefonie_oproepen) een simpele
          // underscore->streepje-vertaling — vandaar generiek i.p.v.
          // hardcoded op training_verslagen (Ronde 3.5-uitbreiding).
          const setMatch = /^UPDATE (\w+) SET (.+) WHERE id = \?;$/.exec(tekst);
          if (setMatch) {
            const tabel = setMatch[1]!.replace(/_/g, "-");
            const kolomNamen = [...setMatch[2]!.matchAll(/(\w+) = \?/g)].map((m) => m[1]!);
            const id = params[params.length - 1] as number;
            const doc = arr(tabel).find((d) => d.id === id);
            if (!doc) return { rows: [] };
            // afronding_resultaat/kandidaat_trainingen zijn de enige jsonb-
            // kolommen die via dit generieke pad geschreven worden — de echte
            // Postgres-kolom rondt een JSON.stringify()-string vanzelf terug
            // naar een object/array (payload.findByID hierboven doet dat ná
            // een ECHTE write ook), dus nabootsen voor gedragsgelijkheid.
            const JSONB_KOLOMMEN = new Set(["afronding_resultaat", "kandidaat_trainingen"]);
            // Payload-postgres se FK-kolomconventie voor relationship-velden
            // is ALTIJD snake_case(veldnaam)+"_id", zonder uitzondering —
            // ook ontdekt (live, via de real-Postgres-concurrencytest) dat
            // een veldnaam die toevallig al op "Id" eindigt GEEN vrijstelling
            // krijgt: zo'n veld zou een dubbele "_id_id"-kolom verwachten, die
            // nooit bestaat. Alle relatievelden in dit project heten daarom
            // inmiddels bewust kaal (bv. "trainer", "verslag" — geen "Id"-
            // suffix), en de naïeve snake->camelCase-conversie hieronder zou
            // hun "_id"-kolom terugvertalen naar bv. "trainerId"/"verslagId",
            // wat niet bestaat: de echte Payload-ORM-laag (payload.findByID)
            // geeft dit veld terug onder zijn eigen, kale veldnaam.
            const RELATIEVELD_KOLOM_OVERRIDES: Record<string, string> = { trainer_id: "trainer", verslag_id: "verslag" };
            kolomNamen.forEach((snakeCase, i) => {
              const camelCase = RELATIEVELD_KOLOM_OVERRIDES[snakeCase] ?? snakeCase.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
              const waarde = params[i];
              doc[camelCase] = JSONB_KOLOMMEN.has(snakeCase) && typeof waarde === "string" ? JSON.parse(waarde) : waarde;
            });
            // Gate 1 — schrijfOproepVelden (oproep-state.ts) hangt sinds
            // 2026-08-25 altijd een letterlijke ", updated_at = now()" aan
            // deze SET-clausule (geen "?"-param, dus niet via kolomNamen
            // hierboven gevangen) — hier expliciet nagebootst, alléén
            // wanneer de echte SQL-tekst dat fragment ook daadwerkelijk
            // bevat (schrijfVerslagVelden in lib/trainers/verslag.ts doet
            // dit bewust niet, blijft dus ongewijzigd).
            if (tekst.includes(", updated_at = now()")) doc.updatedAt = new Date().toISOString();
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
