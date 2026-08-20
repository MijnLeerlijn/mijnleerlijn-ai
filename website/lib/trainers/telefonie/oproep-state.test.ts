import { describe, it, expect } from "vitest";
import {
  maakOfHaalOproep,
  zetTrainerHerkend,
  zetMislukt,
  zetKandidatenAangeboden,
  zetTrainingGekozen,
  zetOpnameVerwacht,
  claimOpnameVerwerking,
  zetTranscriptieBezig,
  zetConceptKlaar,
} from "./oproep-state";
import { maakFakePayload } from "@/lib/support/fake-payload";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — dekt lib/trainers/telefonie/
// oproep-state.ts, de call-state-machine (spec §18). Draait tegen de echte
// raw-SQL-schrijffuncties + de (voor trainer_telefonie_oproepen uitgebreide)
// fake-payload.ts — geen mock van dit bestand zelf, want de correctheid van
// de kolomnamen IN de SQL zelf is precies waar dit bestand op moet
// vertrouwen (zie de trainer/trainer_id-fix hieronder, gevonden tijdens het
// schrijven van deze tests).

describe("maakOfHaalOproep", () => {
  it("maakt een nieuwe oproeprij aan bij een onbekend providerCallId", async () => {
    const { payload, collection } = maakFakePayload({});
    const oproep = await maakOfHaalOproep(payload, "CA123");
    expect(oproep.providerCallId).toBe("CA123");
    expect(oproep.status).toBe("ontvangen");
    expect(collection("trainer-telefonie-oproepen")).toHaveLength(1);
  });

  it("idempotent: een tweede aanroep met hetzelfde providerCallId maakt geen tweede rij aan (spec §18)", async () => {
    const { payload, collection } = maakFakePayload({});
    const eerste = await maakOfHaalOproep(payload, "CA123");
    const tweede = await maakOfHaalOproep(payload, "CA123");
    expect(tweede.id).toBe(eerste.id);
    expect(collection("trainer-telefonie-oproepen")).toHaveLength(1);
  });

  it("herstelt via herlezen bij een gelijktijdige-creatie-race (unique-violation op providerCallId)", async () => {
    const { payload, collection } = maakFakePayload({});
    const echtCreate = payload.create.bind(payload);
    payload.create = (async (opts: Parameters<typeof echtCreate>[0]) => {
      await echtCreate(opts);
      throw new Error("duplicate key value violates unique constraint");
    }) as typeof echtCreate;

    const oproep = await maakOfHaalOproep(payload, "CA-race");
    expect(oproep.providerCallId).toBe("CA-race");
    expect(collection("trainer-telefonie-oproepen")).toHaveLength(1);
  });
});

describe("zetTrainerHerkend", () => {
  it("schrijft trainer_id (niet 'trainer') weg — regressietest: de raw SQL gebruikte aanvankelijk de Payload-veldnaam i.p.v. de echte kolomnaam, wat in een echte Postgres-database `column \"trainer\" does not exist` zou gooien", async () => {
    const { payload } = maakFakePayload({});
    const oproep = await maakOfHaalOproep(payload, "CA1");
    const bijgewerkt = await zetTrainerHerkend(payload, oproep.id, {
      trainerId: 101,
      ruwNummer: "0612345678",
      genormaliseerdNummer: "+31612345678",
      nummerVerborgen: false,
    });
    expect(bijgewerkt.trainer).toBe(101);
    expect(bijgewerkt.status).toBe("trainer_herkend");
    expect(bijgewerkt.genormaliseerdNummer).toBe("+31612345678");
  });
});

describe("zetMislukt", () => {
  it("zet status/foutcode/foutmelding en afgerondOp, zonder trainer wanneer die nog niet bekend was", async () => {
    const { payload } = maakFakePayload({});
    const oproep = await maakOfHaalOproep(payload, "CA1");
    const bijgewerkt = await zetMislukt(payload, oproep.id, "onbekend_nummer", "Nummer niet gekoppeld.");
    expect(bijgewerkt.status).toBe("mislukt");
    expect(bijgewerkt.foutcode).toBe("onbekend_nummer");
    expect(bijgewerkt.afgerondOp).toBeTruthy();
    expect(bijgewerkt.trainer ?? null).toBeNull();
  });

  it("begrenst een extreem lange foutmelding tot 500 tekens (spec §10/§19: nooit onbegrensd opslaan)", async () => {
    const { payload } = maakFakePayload({});
    const oproep = await maakOfHaalOproep(payload, "CA1");
    const bijgewerkt = await zetMislukt(payload, oproep.id, "onbekende_fout", "x".repeat(10_000));
    expect((bijgewerkt.foutmelding as string).length).toBe(500);
  });

  it("schrijft trainer_id (regressietest, zelfde bug als zetTrainerHerkend) wanneer trainerId wordt meegegeven", async () => {
    const { payload } = maakFakePayload({});
    const oproep = await maakOfHaalOproep(payload, "CA1");
    const bijgewerkt = await zetMislukt(payload, oproep.id, "trainer_niet_pilot", "Nog niet in pilot.", { trainerId: 101 });
    expect(bijgewerkt.trainer).toBe(101);
  });
});

describe("zetKandidatenAangeboden / zetTrainingGekozen — jsonb-rondgang", () => {
  it("kandidaatTrainingen komt er als een echte array uit, niet als JSON-string (jsonb-kolom rondt automatisch)", async () => {
    const { payload } = maakFakePayload({});
    const oproep = await maakOfHaalOproep(payload, "CA1");
    const kandidaten = [
      { id: "111", naam: "Training A", schoolNaam: "School A", datum: "2026-08-20" },
      { id: "222", naam: "Training B", schoolNaam: "School B", datum: "2026-08-19" },
    ];
    const bijgewerkt = await zetKandidatenAangeboden(payload, oproep.id, kandidaten);
    expect(bijgewerkt.kandidaatTrainingen).toEqual(kandidaten);
  });

  it("zetTrainingGekozen legt de definitief-gekozen server-side geresolveerde IDs vast en zet status", async () => {
    const { payload } = maakFakePayload({});
    const oproep = await maakOfHaalOproep(payload, "CA1");
    const bijgewerkt = await zetTrainingGekozen(payload, oproep.id, {
      kandidaatTrainingen: [{ id: "111", naam: "Training A", schoolNaam: "School A", datum: "2026-08-20" }],
      mondayTrainingId: "111",
      mondaySchoolId: "500",
      mondayTrainerboardItemId: "999",
      schoolNaam: "School A",
      trainingNaam: "Training A",
    });
    expect(bijgewerkt.status).toBe("training_gekozen");
    expect(bijgewerkt.gekozenMondayTrainingId).toBe("111");
    expect(bijgewerkt.gekozenMondaySchoolId).toBe("500");
    expect(bijgewerkt.gekozenMondayTrainerboardItemId).toBe("999");
  });
});

describe("claimOpnameVerwerking — idempotentiegarantie (spec §12/§18/§24)", () => {
  async function oproepMetStatus(status: string) {
    const { payload, collection } = maakFakePayload({});
    const oproep = await maakOfHaalOproep(payload, "CA1");
    await zetOpnameVerwacht(payload, oproep.id);
    if (status !== "opname_verwacht") {
      const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproep.id)!;
      rij.status = status;
    }
    return { payload, oproep, collection };
  }

  it("scenario 9: claimbaar vanuit 'opname_verwacht', winnaar krijgt true", async () => {
    const { payload, oproep } = await oproepMetStatus("opname_verwacht");
    expect(await claimOpnameVerwerking(payload, oproep.id, "RE1")).toBe(true);
  });

  it("scenario 11/24: een tweede, dubbele webhook voor dezelfde recordingProviderId verliest de claim (false), geen enkele state-wijziging extra", async () => {
    const { payload, oproep, collection } = await oproepMetStatus("opname_verwacht");
    expect(await claimOpnameVerwerking(payload, oproep.id, "RE1")).toBe(true);
    expect(await claimOpnameVerwerking(payload, oproep.id, "RE1")).toBe(false);

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproep.id)!;
    expect(rij.status).toBe("opname_ontvangen");
  });

  it("een andere recordingProviderId op een reeds-geclaimde rij wint ook niet (voorkomt een tweede opname over de eerste heen)", async () => {
    const { payload, oproep } = await oproepMetStatus("opname_verwacht");
    expect(await claimOpnameVerwerking(payload, oproep.id, "RE1")).toBe(true);
    expect(await claimOpnameVerwerking(payload, oproep.id, "RE-ANDERS")).toBe(false);
  });

  it("ook claimbaar vanuit 'training_gekozen' (opnamecallback sneller dan de eigen zetOpnameVerwacht-stap)", async () => {
    const { payload, oproep } = await oproepMetStatus("training_gekozen");
    expect(await claimOpnameVerwerking(payload, oproep.id, "RE1")).toBe(true);
  });

  it("een rij die al 'concept_klaar' of 'mislukt' is, is nooit meer claimbaar", async () => {
    const { payload, oproep } = await oproepMetStatus("concept_klaar");
    expect(await claimOpnameVerwerking(payload, oproep.id, "RE1")).toBe(false);
  });

  it("een niet-bestaand oproepId claimt nooit iets (defensief, kan structureel niet via de echte actieUrl gebeuren)", async () => {
    const { payload } = maakFakePayload({});
    expect(await claimOpnameVerwerking(payload, 999999, "RE1")).toBe(false);
  });
});

describe("zetTranscriptieBezig / zetConceptKlaar", () => {
  it("legt de opnameduur vast en rondt af met verslagId + transcriptielengte (nooit de tekst zelf, spec §9)", async () => {
    const { payload } = maakFakePayload({});
    const oproep = await maakOfHaalOproep(payload, "CA1");
    await zetTranscriptieBezig(payload, oproep.id, 95);
    const afgerond = await zetConceptKlaar(payload, oproep.id, { verslagId: 555, transcriptieLengte: 240 });

    expect(afgerond.status).toBe("concept_klaar");
    expect(afgerond.recordingDuurSeconden).toBe(95);
    expect(afgerond.verslag).toBe(555);
    expect(afgerond.transcriptieLengte).toBe(240);
    expect(afgerond.afgerondOp).toBeTruthy();
  });
});
