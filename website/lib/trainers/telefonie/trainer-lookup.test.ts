import { describe, it, expect } from "vitest";
import { vindTrainerVoorTelefoonnummer, haalAuthTrainerVoorId } from "./trainer-lookup";
import { maakFakePayload } from "@/lib/support/fake-payload";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — dekt lib/trainers/telefonie/
// trainer-lookup.ts. Draait tegen de echte functie + fake-payload (geen
// module-mock): dit IS de beveiligingsgrens uit spec §2/§3/§21, dus deze
// tests bewijzen het daadwerkelijke matchgedrag, niet een voorgewende versie.
//
// Testscenario's uit de opdracht die dit bestand dekt: 1 (bekend nummer ->
// juiste trainer), 2 (onbekend nummer -> geen data), 4 (dubbele
// trainer-telefoonkoppeling -> geblokkeerd), 28 (trainer-pilotvlag uit).

function seedTrainer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101,
    name: "Wessel Kok",
    email: "wessel@mijnleerlijn.nl",
    mondayTrainerboardId: "18424768045",
    mondayUitvoerderItemId: "12419116827",
    actief: true,
    mobielNummer: "+31612345678",
    telefonieActief: true,
    ...overrides,
  };
}

describe("vindTrainerVoorTelefoonnummer", () => {
  it("scenario 1: bekend, genormaliseerd nummer van een pilot-trainer -> gevonden", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [seedTrainer()] });
    const uitkomst = await vindTrainerVoorTelefoonnummer(payload, "0612345678");
    expect(uitkomst.soort).toBe("gevonden");
    if (uitkomst.soort !== "gevonden") return;
    expect(uitkomst.trainer.id).toBe(101);
    expect(uitkomst.trainer.name).toBe("Wessel Kok");
  });

  it("normaliseert de ruwe invoer vóór het opzoeken — een anders genoteerd maar identiek nummer matcht ook", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [seedTrainer()] });
    const uitkomst = await vindTrainerVoorTelefoonnummer(payload, "+31 6 1234 5678");
    expect(uitkomst.soort).toBe("gevonden");
  });

  it("scenario 2: onbekend nummer -> geen enkele informatie over trainers/scholen, uitsluitend 'onbekend'", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [seedTrainer()] });
    const uitkomst = await vindTrainerVoorTelefoonnummer(payload, "0699999999");
    expect(uitkomst).toEqual({ soort: "onbekend" });
  });

  it("ongeldig/onparseerbaar nummer -> geen_geldig_nummer, geen databasequery matcht per ongeluk iets", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [seedTrainer()] });
    expect(await vindTrainerVoorTelefoonnummer(payload, "niet-een-nummer")).toEqual({ soort: "geen_geldig_nummer" });
    expect(await vindTrainerVoorTelefoonnummer(payload, null)).toEqual({ soort: "geen_geldig_nummer" });
  });

  it("een gedeactiveerd traineraccount (actief:false) matcht nooit, ook al is het nummer verder identiek", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [seedTrainer({ actief: false })] });
    expect(await vindTrainerVoorTelefoonnummer(payload, "0612345678")).toEqual({ soort: "onbekend" });
  });

  it("scenario 4: hetzelfde nummer op twee actieve trainers (legacy-dataconflict) -> conflict_meerdere_trainers, NOOIT een van beide gekozen", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [seedTrainer({ id: 101, name: "Wessel Kok" }), seedTrainer({ id: 102, name: "Andere Trainer" })],
    });
    const uitkomst = await vindTrainerVoorTelefoonnummer(payload, "0612345678");
    expect(uitkomst).toEqual({ soort: "conflict_meerdere_trainers" });
  });

  it("een conflict tussen één actieve en één inactieve trainer op hetzelfde nummer wordt niet als conflict gezien (inactieve telt niet mee) — matcht gewoon de actieve", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [seedTrainer({ id: 101, actief: true }), seedTrainer({ id: 102, actief: false })],
    });
    const uitkomst = await vindTrainerVoorTelefoonnummer(payload, "0612345678");
    expect(uitkomst.soort).toBe("gevonden");
    if (uitkomst.soort !== "gevonden") return;
    expect(uitkomst.trainer.id).toBe(101);
  });

  it("scenario 28: trainer herkend maar telefonieActief:false -> niet_in_pilot, met het trainer-object erbij (voor de begroeting) maar zonder verdere toegang", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [seedTrainer({ telefonieActief: false })] });
    const uitkomst = await vindTrainerVoorTelefoonnummer(payload, "0612345678");
    expect(uitkomst.soort).toBe("niet_in_pilot");
    if (uitkomst.soort !== "niet_in_pilot") return;
    expect(uitkomst.trainer.name).toBe("Wessel Kok");
  });
});

describe("haalAuthTrainerVoorId", () => {
  it("haalt een vers AuthTrainer-object op aan de hand van het Payload-rij-ID", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [seedTrainer()] });
    const trainer = await haalAuthTrainerVoorId(payload, 101);
    expect(trainer).toEqual({
      id: 101,
      name: "Wessel Kok",
      email: "wessel@mijnleerlijn.nl",
      mondayTrainerboardId: "18424768045",
      mondayUitvoerderItemId: "12419116827",
      actief: true,
    });
  });

  it("onbekend ID -> null, gooit nooit", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [seedTrainer()] });
    expect(await haalAuthTrainerVoorId(payload, 9999)).toBeNull();
  });
});
