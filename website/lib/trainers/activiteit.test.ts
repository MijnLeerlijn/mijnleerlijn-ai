import { describe, it, expect, vi, beforeEach } from "vitest";
import { haalActiviteitVoorTrainer, kortePreview } from "./activiteit";
import { haalRecenteVerslagenVoorTrainer, type VerslagActiviteit } from "./verslag";
import { haalLogboekVoorTrainer, type LogboekItemRecord } from "./logboek";
import type { Payload } from "payload";
import type { AuthTrainer } from "./auth";

// Traineromgeving V2, Fase 1 (2026-08-28) — dekt lib/trainers/activiteit.ts.
// Mockt beide onderliggende domeinlagen (verslag.ts/logboek.ts) op
// modulevlak — dit bestand test uitsluitend de MERGE/SORTERING, niet de
// eigen dekking van elke leesfunctie zelf (die staat al in
// verslag.test.ts/logboek.test.ts).
vi.mock("./verslag", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./verslag")>();
  return { ...echt, haalRecenteVerslagenVoorTrainer: vi.fn() };
});
vi.mock("./logboek", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./logboek")>();
  return { ...echt, haalLogboekVoorTrainer: vi.fn() };
});

const mockHaalRecenteVerslagenVoorTrainer = vi.mocked(haalRecenteVerslagenVoorTrainer);
const mockHaalLogboekVoorTrainer = vi.mocked(haalLogboekVoorTrainer);

const TRAINER: AuthTrainer = { id: 1, name: "Wessel Kok", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
const FAKE_PAYLOAD = {} as Payload;

function verslagActiviteit(overrides: Partial<VerslagActiviteit> = {}): VerslagActiviteit {
  return { mondayTrainingId: "1", schoolId: "500", schoolNaam: "School A", trainingNaam: "Training A", bron: "portal", status: "voltooid", wanneer: "2026-08-20T10:00:00.000Z", ...overrides };
}

function logboekItem(overrides: Partial<LogboekItemRecord> = {}): LogboekItemRecord {
  return { id: 1, mondaySchoolId: "500", schoolNaam: "School A", type: "notitie", occurredAt: "2026-08-20T10:00:00.000Z", tekst: "Notitie", createdAt: "2026-08-20T10:00:00.000Z", mondayUpdateStatus: "niet_verzonden", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("haalActiviteitVoorTrainer", () => {
  it("merget verslagen en logboekitems, gesorteerd nieuwste eerst", async () => {
    mockHaalRecenteVerslagenVoorTrainer.mockResolvedValue([verslagActiviteit({ wanneer: "2026-08-20T08:00:00.000Z", trainingNaam: "Oudste (verslag)" })]);
    mockHaalLogboekVoorTrainer.mockResolvedValue([logboekItem({ occurredAt: "2026-08-20T12:00:00.000Z", tekst: "Nieuwste (logboek)" })]);

    const items = await haalActiviteitVoorTrainer(FAKE_PAYLOAD, TRAINER, 10);

    expect(items).toHaveLength(2);
    expect(items[0]!.soort).toBe("notitie");
    expect(items[0]!.titel).toBe("Nieuwste (logboek)"); // geen trainingNaam gezet -> valt terug op een preview van de tekst zelf (zie de kortePreview-tests hieronder)
    expect(items[1]!.soort).toBe("training");
    expect(items[1]!.titel).toBe("Oudste (verslag)");
  });

  it("een telefonisch ingesproken verslag krijgt soort 'telefonisch', een portalverslag soort 'training'", async () => {
    mockHaalRecenteVerslagenVoorTrainer.mockResolvedValue([
      verslagActiviteit({ mondayTrainingId: "1", bron: "telefoon", wanneer: "2026-08-20T10:00:00.000Z" }),
      verslagActiviteit({ mondayTrainingId: "2", bron: "portal", wanneer: "2026-08-19T10:00:00.000Z" }),
    ]);
    mockHaalLogboekVoorTrainer.mockResolvedValue([]);

    const items = await haalActiviteitVoorTrainer(FAKE_PAYLOAD, TRAINER, 10);

    expect(items[0]!.soort).toBe("telefonisch");
    expect(items[1]!.soort).toBe("training");
  });

  it("respecteert de limiet ná de merge, ook als beide bronnen samen meer opleveren", async () => {
    mockHaalRecenteVerslagenVoorTrainer.mockResolvedValue([
      verslagActiviteit({ mondayTrainingId: "1", wanneer: "2026-08-20T10:00:00.000Z" }),
      verslagActiviteit({ mondayTrainingId: "2", wanneer: "2026-08-19T10:00:00.000Z" }),
    ]);
    mockHaalLogboekVoorTrainer.mockResolvedValue([logboekItem({ id: 2, occurredAt: "2026-08-18T10:00:00.000Z" }), logboekItem({ id: 3, occurredAt: "2026-08-17T10:00:00.000Z" })]);

    const items = await haalActiviteitVoorTrainer(FAKE_PAYLOAD, TRAINER, 2);

    expect(items).toHaveLength(2);
    expect(items[0]!.wanneer).toBe("2026-08-20T10:00:00.000Z");
    expect(items[1]!.wanneer).toBe("2026-08-19T10:00:00.000Z");
  });

  it("een lege situatie (geen verslagen, geen logboekitems) wordt netjes afgehandeld — geen fout, lege array", async () => {
    mockHaalRecenteVerslagenVoorTrainer.mockResolvedValue([]);
    mockHaalLogboekVoorTrainer.mockResolvedValue([]);

    const items = await haalActiviteitVoorTrainer(FAKE_PAYLOAD, TRAINER, 10);
    expect(items).toEqual([]);
  });

  it("titel: logboekitem MET gekoppelde training toont de trainingnaam, ZONDER training een preview van de notitietekst", async () => {
    mockHaalRecenteVerslagenVoorTrainer.mockResolvedValue([]);
    mockHaalLogboekVoorTrainer.mockResolvedValue([
      logboekItem({ id: 1, type: "helpdesk", trainingNaam: "Gekoppelde training", occurredAt: "2026-08-20T10:00:00.000Z" }),
      logboekItem({ id: 2, type: "overleg", trainingNaam: null, tekst: "Kort telefonisch contact over de planning van volgende week.", occurredAt: "2026-08-19T10:00:00.000Z" }),
    ]);

    const items = await haalActiviteitVoorTrainer(FAKE_PAYLOAD, TRAINER, 10);

    // Mét training: trainingnaam wint. De badge (items[x].soort) blijft in beide
    // gevallen gewoon het type tonen — alleen deze tweede titelregel verandert.
    expect(items[0]!.titel).toBe("Gekoppelde training");
    // Zonder training: geen dubbel typelabel meer ("Overleg · Overleg"), maar een
    // preview van de eigen tekst.
    expect(items[1]!.titel).toBe("Kort telefonisch contact over de planning van volgende week.");
  });
});

describe("kortePreview", () => {
  it("geeft korte tekst ongewijzigd terug (op witruimte-normalisatie na)", () => {
    expect(kortePreview("Kort telefonisch contact gehad.")).toBe("Kort telefonisch contact gehad.");
  });

  it("valt terug op de neutrale titel 'Logboekitem' bij lege of alleen-witruimte tekst", () => {
    expect(kortePreview("")).toBe("Logboekitem");
    expect(kortePreview("   \n\t  ")).toBe("Logboekitem");
  });

  it("begrenst lange tekst tot 80 tekens met een ellipsis", () => {
    const langeTekst = "a".repeat(120);

    const preview = kortePreview(langeTekst);

    expect(preview).toBe(`${"a".repeat(80)}…`);
    expect(preview.length).toBe(81);
  });

  it("slaat witregels en dubbele spaties plat tot één regel", () => {
    expect(kortePreview("Eerste regel\n\nTweede   regel")).toBe("Eerste regel Tweede regel");
  });
});
