import { describe, it, expect, vi, beforeEach } from "vitest";
import { haalTelefonieKandidaten, labelKandidaten, type TelefonieKandidaat } from "./kandidaten";
import { haalRecenteTrainingenVoorTelefonie, vandaagIsoAmsterdam } from "../monday-links";
import { maakFakePayload } from "@/lib/support/fake-payload";
import type { AuthTrainer } from "../auth";
import type { TrainingMetSchool } from "../monday-links";

// Trainertelefonie V1-afronding (2026-08-26) — dekt lib/trainers/telefonie/
// kandidaten.ts, DE centrale kandidatenlaag (spec §6/§16). Draait tegen de
// ECHTE haalVerslagenPerTraining (lib/trainers/verslag.ts) + fake-payload —
// dat is precies waar deze module haar waarde bewijst: "training met een
// bestaand verslag (in élke status) wordt nooit meer aangeboden". Uitsluitend
// haalRecenteTrainingenVoorTelefonie (Monday-leeslaag, al gedekt in
// monday-links.test.ts) wordt gemockt.
vi.mock("../monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../monday-links")>();
  return { ...echt, haalRecenteTrainingenVoorTelefonie: vi.fn() };
});

const mockHaalRecenteTrainingen = vi.mocked(haalRecenteTrainingenVoorTelefonie);

const TRAINER: AuthTrainer = {
  id: 101,
  name: "Wessel Kok",
  email: "wessel@mijnleerlijn.nl",
  mondayTrainerboardId: "18424768045",
  mondayUitvoerderItemId: "12419116827",
  actief: true,
};

const VANDAAG = vandaagIsoAmsterdam();
function dagenGeleden(n: number): string {
  const d = new Date(`${VANDAAG}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function training(overrides: Partial<TrainingMetSchool> = {}): TrainingMetSchool {
  return {
    id: "111",
    naam: "Online spreekuur",
    status: "gepland",
    ruweStatusTekst: "Gepland",
    datum: VANDAAG,
    logboekIngevuld: false,
    trainerboardItemId: "222",
    bron: "mijnleerlijn",
    schoolId: "500",
    schoolNaam: "Montessori Gorinchem",
    ...overrides,
  };
}

function verslagRij(overrides: Record<string, unknown> = {}) {
  return { id: Math.floor(Math.random() * 1_000_000), trainer: TRAINER.id, mondayTrainingId: "111", status: "concept", bron: "telefoon", ...overrides };
}

beforeEach(() => {
  mockHaalRecenteTrainingen.mockReset();
});

describe("haalTelefonieKandidaten", () => {
  it("1. geen recente trainingen -> beide lagen leeg", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([]);
    const { payload } = maakFakePayload({});

    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);

    expect(resultaat).toEqual({ vandaag: [], ouder: [] });
  });

  it("2. training van vandaag zonder verslag -> in de vandaag-laag", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ datum: VANDAAG })]);
    const { payload } = maakFakePayload({});
    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);
    expect(resultaat.vandaag).toHaveLength(1);
    expect(resultaat.vandaag[0]!.id).toBe("111");
    expect(resultaat.ouder).toHaveLength(0);
  });

  it("3. training van gisteren zonder verslag -> in de ouder-laag, niet in vandaag", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ datum: dagenGeleden(1) })]);
    const { payload } = maakFakePayload({});
    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);
    expect(resultaat.vandaag).toHaveLength(0);
    expect(resultaat.ouder).toHaveLength(1);
  });

  it("4. training vandaag MET een bestaand concept-verslag -> uitgesloten", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ datum: VANDAAG })]);
    const { payload } = maakFakePayload({ "training-verslagen": [verslagRij({ status: "concept" })] });
    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);
    expect(resultaat.vandaag).toHaveLength(0);
    expect(resultaat.ouder).toHaveLength(0);
  });

  it.each(["concept", "gedeeltelijk", "bevestigd", "voltooid"] as const)("5. training MET een bestaand verslag met status '%s' -> altijd uitgesloten, ongeacht status", async (status) => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ datum: VANDAAG })]);
    const { payload } = maakFakePayload({ "training-verslagen": [verslagRij({ status })] });
    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);
    expect(resultaat.vandaag).toHaveLength(0);
  });

  it("6. een verslag van een ANDERE trainer voor dezelfde mondayTrainingId sluit deze trainer se training niet uit (geen kruisbestuiving)", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ datum: VANDAAG })]);
    const { payload } = maakFakePayload({ "training-verslagen": [verslagRij({ trainer: 999, status: "concept" })] });
    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);
    expect(resultaat.vandaag).toHaveLength(1);
  });

  it("7. een expliciet verwijderd concept (geen rij meer in training-verslagen) -> de training is weer beschikbaar", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ datum: VANDAAG })]);
    const { payload, collection } = maakFakePayload({ "training-verslagen": [verslagRij({ status: "concept" })] });
    // Eerst bewijzen dat hij uitgesloten is...
    expect((await haalTelefonieKandidaten(payload, TRAINER)).vandaag).toHaveLength(0);
    // ...dan de rij "verwijderen" (zelfde effect als verwijderConcept, lib/trainers/verslag.ts) en opnieuw ophalen.
    collection("training-verslagen").length = 0;
    expect((await haalTelefonieKandidaten(payload, TRAINER)).vandaag).toHaveLength(1);
  });

  it("8. meerdere trainingen vandaag + meerdere ouder, gemixt met en zonder verslag -> correcte splitsing én exclusie tegelijk", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([
      training({ id: "1", datum: VANDAAG, schoolNaam: "School A" }),
      training({ id: "2", datum: VANDAAG, schoolNaam: "School B" }),
      training({ id: "3", datum: dagenGeleden(1), schoolNaam: "School C" }),
      training({ id: "4", datum: dagenGeleden(2), schoolNaam: "School D" }),
    ]);
    const { payload } = maakFakePayload({ "training-verslagen": [verslagRij({ mondayTrainingId: "2", status: "concept" }), verslagRij({ mondayTrainingId: "3", status: "voltooid" })] });

    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);

    expect(resultaat.vandaag.map((k) => k.id)).toEqual(["1"]); // "2" uitgesloten
    expect(resultaat.ouder.map((k) => k.id)).toEqual(["4"]); // "3" uitgesloten
  });

  it("9. ouder-laag blijft meest-recent-eerst gesorteerd (overgenomen van haalRecenteTrainingenVoorTelefonie, niet opnieuw gesorteerd)", async () => {
    // haalRecenteTrainingenVoorTelefonie garandeert zelf al meest-recent-eerst
    // (zie monday-links.ts) — de mock hier levert dus bewust AL in die volgorde
    // aan, om te bewijzen dat kandidaten.ts niets herordent.
    mockHaalRecenteTrainingen.mockResolvedValue([
      training({ id: "recent", datum: dagenGeleden(1), schoolNaam: "Meest recent" }),
      training({ id: "midden", datum: dagenGeleden(2), schoolNaam: "Midden" }),
      training({ id: "oud", datum: dagenGeleden(3), schoolNaam: "Oudste" }),
    ]);
    const { payload } = maakFakePayload({});
    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);
    expect(resultaat.ouder.map((k) => k.id)).toEqual(["recent", "midden", "oud"]);
  });

  it("10. geen recente trainingen bij Monday -> haalVerslagenPerTraining wordt niet onnodig met een lege lijst aangeroepen (N+1-preventie)", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([]);
    const { payload } = maakFakePayload({});
    const findSpy = vi.spyOn(payload, "find");
    await haalTelefonieKandidaten(payload, TRAINER);
    // Upsell-ronde (2026-09-02) — haalAanvullendeTrainingenAlsSamenvattingen
    // (lib/trainers/aanvullende-trainingen.ts) doet altijd precies ÉÉN eigen
    // find-aanroep, ongeacht het aantal Monday-trainingen (geen N+1, gewoon
    // een tweede, onafhankelijke bron naast Monday) — de eis die deze test
    // bewaakt blijft dus intact als "geen find naar training-verslagen",
    // niet meer als "geen enkele find".
    expect(findSpy).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "training-verslagen" }));
  });
});

// Upsell-ronde (2026-09-02, spec §A5) — "een aanvullende training met datum
// moet ook door de telefonische flow gevonden kunnen worden [...] zorg dat
// duidelijk kan worden onderscheiden om welke training het gaat." Bewijst
// dat haalTelefonieKandidaten de twee bronnen simpelweg samenvoegt (zelfde
// vandaag/ouder-splitsing, zelfde verslag-uitsluiting, zelfde sortering) —
// geen tweede kandidatenlogica voor aanvullende trainingen.
describe("haalTelefonieKandidaten — aanvullende trainingen (spec §A5)", () => {
  function aanvullendeRij(overrides: Record<string, unknown> = {}) {
    return { id: 1, trainer: TRAINER.id, mondaySchoolId: "500", schoolNaam: "Montessori Gorinchem", naam: "Bijles rekenen", datum: VANDAAG, ...overrides };
  }

  it("een aanvullende training van vandaag zonder verslag verschijnt als kandidaat, gelabeld bron: 'aanvullend'", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([]);
    const { payload } = maakFakePayload({ "aanvullende-trainingen": [aanvullendeRij()] });

    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);

    expect(resultaat.vandaag).toHaveLength(1);
    expect(resultaat.vandaag[0]).toMatchObject({ id: "aanvullend:1", bron: "aanvullend", schoolNaam: "Montessori Gorinchem" });
  });

  it("een aanvullende training MET een bestaand verslag wordt net als een ML-training uitgesloten", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([]);
    const { payload } = maakFakePayload({
      "aanvullende-trainingen": [aanvullendeRij()],
      "training-verslagen": [verslagRij({ mondayTrainingId: "aanvullend:1", status: "bevestigd" })],
    });

    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);

    expect(resultaat.vandaag).toHaveLength(0);
    expect(resultaat.ouder).toHaveLength(0);
  });

  it("ML- en aanvullende trainingen van vandaag komen samen in dezelfde vandaag-laag terecht", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ id: "111", datum: VANDAAG })]);
    const { payload } = maakFakePayload({ "aanvullende-trainingen": [aanvullendeRij({ datum: VANDAAG })] });

    const resultaat = await haalTelefonieKandidaten(payload, TRAINER);

    expect(resultaat.vandaag.map((k) => k.id).sort()).toEqual(["111", "aanvullend:1"]);
  });
});

describe("labelKandidaten", () => {
  const K = (overrides: Partial<TelefonieKandidaat> = {}): TelefonieKandidaat => ({
    id: "1",
    naam: "Training",
    schoolNaam: "School A",
    schoolId: "500",
    trainerboardItemId: "222",
    datum: VANDAAG,
    bron: "mijnleerlijn",
    ...overrides,
  });

  it("11. unieke schoolnamen binnen de laag -> uitsluitend schoolnaam, nooit de trainingnaam erbij", () => {
    const labels = labelKandidaten([K({ id: "1", schoolNaam: "School A" }), K({ id: "2", schoolNaam: "School B" })]);
    expect(labels).toEqual(["School A", "School B"]);
  });

  it("12. twee kandidaten delen dezelfde schoolnaam -> uitsluitend DIE twee krijgen de trainingnaam erbij, de rest niet", () => {
    const labels = labelKandidaten([
      K({ id: "1", schoolNaam: "School A", naam: "Ochtendtraining" }),
      K({ id: "2", schoolNaam: "School A", naam: "Middagtraining" }),
      K({ id: "3", schoolNaam: "School B", naam: "Enige van School B" }),
    ]);
    expect(labels).toEqual(["School A — Ochtendtraining", "School A — Middagtraining", "School B"]);
  });

  it("13. één kandidaat -> altijd uitsluitend de schoolnaam (nooit onnodig de trainingnaam)", () => {
    expect(labelKandidaten([K({ schoolNaam: "Enige School" })])).toEqual(["Enige School"]);
  });
});
