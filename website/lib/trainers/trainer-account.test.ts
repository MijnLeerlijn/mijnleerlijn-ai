import { describe, it, expect } from "vitest";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { verwijderTrainerAccountAlsAdmin, zetTrainerActiefStatus } from "./trainer-account";

// Admin volledig traineraccountbeheer (vervolgronde) — spec: "onderzoek vóór
// implementatie alle relaties... verwijder niet blind cascading historie als
// dat onveilig is". Live geverifieerd via payload/migrations/*.ts: alle
// zeven onderstaande collecties verwijzen naar trainer-accounts; twee
// daarvan (trainer-bestanden.uploader_id, trainer-kennisvragen.trainer_id)
// zijn zelfs NOT NULL met een ON DELETE SET NULL-FK — een kale delete zou
// daar een harde Postgres-fout geven zodra er een rij bestaat. Deze tests
// bewijzen dat verwijderTrainerAccountAlsAdmin per relatietype blokkeert,
// vóórdat er ooit een echte delete wordt geprobeerd (dus ook bij de vijf
// nullable relaties nooit stilzwijgend trainer-toeschrijving op NULL zet).

const TRAINER = { id: 1, name: "Wessel Kok", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "board-1", mondayUitvoerderItemId: "uitv-1", actief: true };

describe("verwijderTrainerAccountAlsAdmin", () => {
  it("niet_gevonden bij een onbekend trainer-ID", async () => {
    const { payload } = maakFakePayload({});
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, 999);
    expect(uitkomst.soort).toBe("niet_gevonden");
  });

  it("verwijdert het account als er in geen enkele van de zeven gerelateerde collecties nog een rij bestaat", async () => {
    const { payload, collection } = maakFakePayload({ "trainer-accounts": [TRAINER] });
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, 1);
    expect(uitkomst.soort).toBe("verwijderd");
    expect(collection("trainer-accounts")).toHaveLength(0);
  });

  it("weigert te verwijderen bij een bestaand trainingsverslag, en verwijdert niets", async () => {
    const { payload, collection } = maakFakePayload({
      "trainer-accounts": [TRAINER],
      "training-verslagen": [{ id: 1, trainer: 1, mondayTrainingId: "t1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "Training 1", status: "voltooid", bron: "portal", updatedAt: "2026-08-20T00:00:00.000Z", telefonieOproep: null }],
    });
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, 1);
    if (uitkomst.soort !== "heeft_relaties") throw new Error("verwachtte heeft_relaties");
    expect(uitkomst.relaties).toEqual([{ label: "trainingsverslagen", aantal: 1 }]);
    expect(collection("trainer-accounts")).toHaveLength(1);
  });

  it("weigert te verwijderen bij een bestaand logboekitem", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [TRAINER],
      "trainer-logboek-items": [{ id: 1, trainer: 1, mondaySchoolId: "s1", schoolNaam: "School A", type: "notitie", occurredAt: "2026-08-20T00:00:00.000Z", tekst: "Notitie", mondayTrainingId: null, trainingNaam: null, createdAt: "2026-08-20T00:00:00.000Z" }],
    });
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, 1);
    if (uitkomst.soort !== "heeft_relaties") throw new Error("verwachtte heeft_relaties");
    expect(uitkomst.relaties.some((r) => r.label === "logboekitems" && r.aantal === 1)).toBe(true);
  });

  it("weigert te verwijderen bij een bestaande telefonie-oproep", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [TRAINER],
      "trainer-telefonie-oproepen": [{ id: 1, provider: "telnyx", providerCallId: "call-1", trainer: 1, status: "concept_klaar", ontvangenOp: "2026-08-20T00:00:00.000Z" }],
    });
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, 1);
    if (uitkomst.soort !== "heeft_relaties") throw new Error("verwachtte heeft_relaties");
    expect(uitkomst.relaties.some((r) => r.label === "telefonie-oproepen" && r.aantal === 1)).toBe(true);
  });

  it("weigert te verwijderen bij een bestaand bestand (uploader-relatie, niet trainer-relatie)", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [TRAINER],
      "trainer-bestanden": [{ id: 1, uploader: 1, titel: "Bestand", categorie: "overig", scope: "algemeen", createdAt: "2026-08-20T00:00:00.000Z" }],
    });
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, 1);
    if (uitkomst.soort !== "heeft_relaties") throw new Error("verwachtte heeft_relaties");
    expect(uitkomst.relaties.some((r) => r.label === "bestanden" && r.aantal === 1)).toBe(true);
  });

  it("weigert te verwijderen bij een bestaande kennisvraag", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [TRAINER],
      "trainer-kennisvragen": [{ id: 1, trainer: 1, vraag: "Hoe werkt dit?", createdAt: "2026-08-20T00:00:00.000Z" }],
    });
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, 1);
    if (uitkomst.soort !== "heeft_relaties") throw new Error("verwachtte heeft_relaties");
    expect(uitkomst.relaties.some((r) => r.label === "kennisvragen" && r.aantal === 1)).toBe(true);
  });

  it("weigert te verwijderen bij bestaande audit-logboekgebeurtenissen (trainer-log-events + trainer-ai-log-events)", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [TRAINER],
      "trainer-log-events": [{ id: 1, trainer: 1, gebeurtenis: "iets", createdAt: "2026-08-20T00:00:00.000Z" }],
      "trainer-ai-log-events": [{ id: 1, trainer: 1, gebeurtenis: "iets", createdAt: "2026-08-20T00:00:00.000Z" }],
    });
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, 1);
    if (uitkomst.soort !== "heeft_relaties") throw new Error("verwachtte heeft_relaties");
    expect(uitkomst.relaties).toHaveLength(2);
  });

  it("een relatie van een ANDERE trainer blokkeert deze trainer se verwijdering niet", async () => {
    const trainerB = { ...TRAINER, id: 2, mondayTrainerboardId: "board-2", mondayUitvoerderItemId: "uitv-2" };
    const { payload, collection } = maakFakePayload({
      "trainer-accounts": [TRAINER, trainerB],
      "training-verslagen": [{ id: 1, trainer: 2, mondayTrainingId: "t1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "Training 1", status: "voltooid", bron: "portal", updatedAt: "2026-08-20T00:00:00.000Z", telefonieOproep: null }],
    });
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, 1);
    expect(uitkomst.soort).toBe("verwijderd");
    expect(collection("trainer-accounts").map((t) => t.id)).toEqual([2]);
  });
});

describe("zetTrainerActiefStatus", () => {
  it("niet_gevonden bij een onbekend trainer-ID", async () => {
    const { payload } = maakFakePayload({});
    const uitkomst = await zetTrainerActiefStatus(payload, 999, false);
    expect(uitkomst.soort).toBe("niet_gevonden");
  });

  it("zet actief op false (deactiveren) en behoudt de rest van het account ongewijzigd", async () => {
    const { payload, collection } = maakFakePayload({ "trainer-accounts": [TRAINER] });
    const uitkomst = await zetTrainerActiefStatus(payload, 1, false);
    expect(uitkomst).toEqual({ soort: "ok", actief: false });
    const rij = collection("trainer-accounts")[0];
    expect(rij?.actief).toBe(false);
    expect(rij?.name).toBe("Wessel Kok");
    expect(rij?.email).toBe("wessel@mijnleerlijn.nl");
  });

  it("zet actief weer op true (activeren)", async () => {
    const { payload, collection } = maakFakePayload({ "trainer-accounts": [{ ...TRAINER, actief: false }] });
    const uitkomst = await zetTrainerActiefStatus(payload, 1, true);
    expect(uitkomst).toEqual({ soort: "ok", actief: true });
    expect(collection("trainer-accounts")[0]?.actief).toBe(true);
  });
});
