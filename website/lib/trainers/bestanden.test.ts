import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  maakSchoolBestand,
  maakAlgemeenBestand,
  haalMijnBestanden,
  haalMetMijGedeeldeBestanden,
  haalSchoolBestanden,
  magTrainerBestandZien,
  magTrainerBestandVerwijderen,
  genereerTrainerBestandDownloadUrl,
  genereerBestandDownloadUrlAlsAdmin,
  verwijderTrainerBestand,
  valideerBestandstype,
  type RuwOpTeSlaanBestand,
} from "./bestanden";
import { haalSchoolDetail, haalTrainingVoorMutatie, bepaalScholenVoorTrainer } from "./monday-links";
import { uploadTrainerBestand, genereerDownloadUrl } from "@/services/storage";
import { maakFakePayload } from "@/lib/support/fake-payload";
import type { AuthTrainer } from "./auth";

// Traineromgeving V2, Fase 3 (2026-08-23) — dekt de opdrachtseis-testlijsten
// §15 (rechten), §16 (schoolbestanden) en §17 (upload/download-validatie).
// monday-links.ts is volledig gemockt: dit bestand test uitsluitend
// lib/trainers/bestanden.ts se EIGEN logica (validatie/autorisatie/
// dataopbouw), niet de live-Monday-scoping zelf (die heeft al zijn eigen,
// uitgebreide testdekking in monday-links.test.ts). services/storage.ts is
// ook gemockt: geen echte Vercel Blob-aanroepen in een unit-test.

vi.mock("./monday-links", () => ({
  haalSchoolDetail: vi.fn(),
  haalTrainingVoorMutatie: vi.fn(),
  bepaalScholenVoorTrainer: vi.fn(),
}));
vi.mock("@/services/storage", () => ({
  uploadTrainerBestand: vi.fn(),
  genereerDownloadUrl: vi.fn(),
}));

const mockSchoolDetail = vi.mocked(haalSchoolDetail);
const mockTrainingVoorMutatie = vi.mocked(haalTrainingVoorMutatie);
const mockScholenVoorTrainer = vi.mocked(bepaalScholenVoorTrainer);
const mockUpload = vi.mocked(uploadTrainerBestand);
const mockDownloadUrl = vi.mocked(genereerDownloadUrl);

const TRAINER: AuthTrainer = { id: 1, name: "Trainer Een", email: "t1@x.nl", mondayTrainerboardId: "tb1", mondayUitvoerderItemId: "u1", actief: true };
const ANDERE_TRAINER: AuthTrainer = { id: 2, name: "Trainer Twee", email: "t2@x.nl", mondayTrainerboardId: "tb2", mondayUitvoerderItemId: "u2", actief: true };
const DERDE_TRAINER: AuthTrainer = { id: 3, name: "Trainer Drie", email: "t3@x.nl", mondayTrainerboardId: "tb3", mondayUitvoerderItemId: "u3", actief: true };

function ruwBestand(overrides: Partial<RuwOpTeSlaanBestand> = {}): RuwOpTeSlaanBestand {
  return { buffer: Buffer.from("inhoud"), filename: "document.pdf", mimeType: "application/pdf", size: 1000, ...overrides };
}

function schoolBestandFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    scope: "school",
    titel: "Curriculum groep 5",
    categorie: "curriculum",
    storageKey: "trainer-bestanden/x-curriculum.pdf",
    filename: "curriculum.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    uploader: TRAINER.id,
    mondaySchoolId: "school-1",
    schoolNaam: "De Wilgenhof",
    createdAt: "2026-08-20T09:00:00.000Z",
    ...overrides,
  };
}

function algemeenBestandFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    scope: "trainer",
    titel: "Presentatie kick-off",
    categorie: "presentatie",
    storageKey: "trainer-bestanden/x-presentatie.pptx",
    filename: "presentatie.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: 4096,
    uploader: TRAINER.id,
    zichtbaarheid: "prive",
    deelgroepen: [],
    createdAt: "2026-08-20T09:00:00.000Z",
    ...overrides,
  };
}

function groepFixture(overrides: Record<string, unknown> = {}) {
  return { id: 10, naam: "Montessori-trainers", actief: true, leden: [], ...overrides };
}

beforeEach(() => {
  mockSchoolDetail.mockReset();
  mockTrainingVoorMutatie.mockReset();
  mockScholenVoorTrainer.mockReset();
  mockUpload.mockReset();
  mockDownloadUrl.mockReset();
  mockUpload.mockResolvedValue({
    storageKey: "trainer-bestanden/abc-document.pdf",
    filename: "document.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
    url: "https://x.private.blob.vercel-storage.com/abc",
  });
});

describe("valideerBestandstype — §17 geldig/ongeldig bestandstype", () => {
  it.each([
    ["document.pdf", "application/pdf"],
    ["sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["export.csv", "text/csv"],
    ["export.csv", "application/vnd.ms-excel"],
    ["foto.jpg", "image/jpeg"],
    ["foto.jpeg", "image/jpeg"],
    ["logo.png", "image/png"],
  ])("accepteert %s met MIME %s", (filename, mimeType) => {
    expect(valideerBestandstype(filename, mimeType)).toBe(true);
  });

  it("weigert een bestandsnaam-MIME-mismatch (nooit uitsluitend op extensie vertrouwen)", () => {
    expect(valideerBestandstype("document.pdf", "image/png")).toBe(false);
  });

  it("weigert een niet-toegestane extensie (bv. .exe) — allowlist, geen blocklist", () => {
    expect(valideerBestandstype("virus.exe", "application/x-msdownload")).toBe(false);
  });

  it("weigert een bestand zonder extensie", () => {
    expect(valideerBestandstype("bestand", "application/pdf")).toBe(false);
  });
});

describe("maakSchoolBestand — §16 schoolbestanden + §17 validatie", () => {
  it("weigert een school waar de trainer niet aan gekoppeld is (niet_gevonden, anti-enumeratie)", async () => {
    mockSchoolDetail.mockResolvedValue(null);
    const { payload } = maakFakePayload({});
    const uitkomst = await maakSchoolBestand(payload, TRAINER, { mondaySchoolId: "school-x", titel: "T", categorie: "overig", bestand: ruwBestand() });
    expect(uitkomst.soort).toBe("niet_gevonden");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("school met 0 trainingen kan nog steeds een bestand krijgen", async () => {
    mockSchoolDetail.mockResolvedValue({ id: "school-1", naam: "De Vuurvlinder", trainingen: {} } as never);
    const { payload } = maakFakePayload({});
    const uitkomst = await maakSchoolBestand(payload, TRAINER, { mondaySchoolId: "school-1", titel: "Export", categorie: "export", bestand: ruwBestand() });
    expect(uitkomst.soort).toBe("ok");
  });

  it("weigert een ongeldige categorie", async () => {
    mockSchoolDetail.mockResolvedValue({ id: "school-1", naam: "School" } as never);
    const { payload } = maakFakePayload({});
    const uitkomst = await maakSchoolBestand(payload, TRAINER, { mondaySchoolId: "school-1", titel: "T", categorie: "onbestaand", bestand: ruwBestand() });
    expect(uitkomst).toEqual({ soort: "ongeldige_invoer", boodschap: "Kies een geldige categorie." });
  });

  it("weigert een te groot bestand", async () => {
    mockSchoolDetail.mockResolvedValue({ id: "school-1", naam: "School" } as never);
    const { payload } = maakFakePayload({});
    const uitkomst = await maakSchoolBestand(payload, TRAINER, {
      mondaySchoolId: "school-1",
      titel: "T",
      categorie: "overig",
      bestand: ruwBestand({ size: 26 * 1024 * 1024 }),
    });
    expect(uitkomst).toEqual({ soort: "ongeldige_invoer", boodschap: "Bestand is te groot (max. 25MB)." });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("weigert een ongeldig bestandstype", async () => {
    mockSchoolDetail.mockResolvedValue({ id: "school-1", naam: "School" } as never);
    const { payload } = maakFakePayload({});
    const uitkomst = await maakSchoolBestand(payload, TRAINER, {
      mondaySchoolId: "school-1",
      titel: "T",
      categorie: "overig",
      bestand: ruwBestand({ filename: "virus.exe", mimeType: "application/x-msdownload" }),
    });
    expect(uitkomst).toEqual({ soort: "ongeldige_invoer", boodschap: "Dit bestandstype wordt niet ondersteund." });
  });

  it("training is optioneel — succesvol zonder mondayTrainingId", async () => {
    mockSchoolDetail.mockResolvedValue({ id: "school-1", naam: "De Wilgenhof" } as never);
    const { payload } = maakFakePayload({});
    const uitkomst = await maakSchoolBestand(payload, TRAINER, { mondaySchoolId: "school-1", titel: "T", categorie: "overig", bestand: ruwBestand() });
    expect(uitkomst.soort).toBe("ok");
    expect(mockTrainingVoorMutatie).not.toHaveBeenCalled();
    if (uitkomst.soort === "ok") expect(uitkomst.bestand.mondayTrainingId).toBeNull();
  });

  it("weigert een training die niet bij de opgegeven school hoort", async () => {
    mockSchoolDetail.mockResolvedValue({ id: "school-1", naam: "De Wilgenhof" } as never);
    mockTrainingVoorMutatie.mockResolvedValue({ training: { id: "t-1", naam: "Rekenen" }, schoolId: "ANDERE-SCHOOL", schoolNaam: "X" } as never);
    const { payload } = maakFakePayload({});
    const uitkomst = await maakSchoolBestand(payload, TRAINER, {
      mondaySchoolId: "school-1",
      titel: "T",
      categorie: "overig",
      mondayTrainingId: "t-1",
      bestand: ruwBestand(),
    });
    expect(uitkomst.soort).toBe("niet_gevonden");
  });

  it("koppelt een training correct als die wél bij de school hoort", async () => {
    mockSchoolDetail.mockResolvedValue({ id: "school-1", naam: "De Wilgenhof" } as never);
    mockTrainingVoorMutatie.mockResolvedValue({ training: { id: "t-1", naam: "Rekenen groep 5" }, schoolId: "school-1", schoolNaam: "De Wilgenhof" } as never);
    const { payload } = maakFakePayload({});
    const uitkomst = await maakSchoolBestand(payload, TRAINER, {
      mondaySchoolId: "school-1",
      titel: "T",
      categorie: "overig",
      mondayTrainingId: "t-1",
      bestand: ruwBestand(),
    });
    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort === "ok") expect(uitkomst.bestand.trainingNaam).toBe("Rekenen groep 5");
  });
});

describe("maakAlgemeenBestand — §4/§15 delen met deelgroepen", () => {
  it("'Alleen voor mij' slaat op zonder deelgroepen te vereisen", async () => {
    const { payload } = maakFakePayload({});
    const uitkomst = await maakAlgemeenBestand(payload, TRAINER, { titel: "T", categorie: "werkdocument", zichtbaarheid: "prive", bestand: ruwBestand() });
    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort === "ok") expect(uitkomst.bestand.deelgroepen).toEqual([]);
  });

  it("weigert 'gedeeld' zonder gekozen groep", async () => {
    const { payload } = maakFakePayload({});
    const uitkomst = await maakAlgemeenBestand(payload, TRAINER, { titel: "T", categorie: "werkdocument", zichtbaarheid: "gedeeld", deelgroepIds: [], bestand: ruwBestand() });
    expect(uitkomst).toEqual({ soort: "ongeldige_invoer", boodschap: "Kies minstens één groep om mee te delen." });
  });

  it("weigert delen met een groep waarvan de trainer geen lid is", async () => {
    const { payload } = maakFakePayload({ "trainer-deelgroepen": [groepFixture({ id: 10, leden: [ANDERE_TRAINER.id] })] });
    const uitkomst = await maakAlgemeenBestand(payload, TRAINER, { titel: "T", categorie: "werkdocument", zichtbaarheid: "gedeeld", deelgroepIds: [10], bestand: ruwBestand() });
    expect(uitkomst).toEqual({ soort: "ongeldige_invoer", boodschap: "Je kunt alleen delen met groepen waar je zelf lid van bent." });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("staat delen toe met een groep waar de trainer wél lid van is", async () => {
    const { payload } = maakFakePayload({ "trainer-deelgroepen": [groepFixture({ id: 10, leden: [TRAINER.id] })] });
    const uitkomst = await maakAlgemeenBestand(payload, TRAINER, { titel: "T", categorie: "werkdocument", zichtbaarheid: "gedeeld", deelgroepIds: [10], bestand: ruwBestand() });
    expect(uitkomst.soort).toBe("ok");
  });
});

describe("haalMijnBestanden — §2", () => {
  it("toont uitsluitend de eigen algemene bestanden van de trainer, niet die van een ander of schoolbestanden", async () => {
    const { payload } = maakFakePayload({
      "trainer-bestanden": [
        algemeenBestandFixture({ id: 1, uploader: TRAINER.id }),
        algemeenBestandFixture({ id: 2, uploader: ANDERE_TRAINER.id }),
        schoolBestandFixture({ id: 3, uploader: TRAINER.id }),
      ],
    });
    const lijst = await haalMijnBestanden(payload, TRAINER);
    expect(lijst.map((b) => b.id)).toEqual([1]);
  });
});

describe("haalMetMijGedeeldeBestanden — §4/§15 dynamisch groepslidmaatschap", () => {
  it("een groepslid ziet een bestand dat met zijn groep gedeeld is", async () => {
    const { payload } = maakFakePayload({
      "trainer-deelgroepen": [groepFixture({ id: 10, naam: "Regio Zuid", leden: [TRAINER.id] })],
      "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: ANDERE_TRAINER.id, zichtbaarheid: "gedeeld", deelgroepen: [10] })],
    });
    const lijst = await haalMetMijGedeeldeBestanden(payload, TRAINER);
    expect(lijst).toHaveLength(1);
    // Op naam (niet id) zou hier "Onbekende groep" opleveren: fake-payload.ts
    // bootst GEEN depth:1-relatiepopulatie na (elders in dit project ook al
    // zo, zie naarRecord() se eigen fallback daarvoor) — de echte Payload-
    // local-API doet dat wél, dus in productie staat hier de echte naam.
    expect(lijst[0]!.gedeeldViaGroepen.map((g) => g.id)).toEqual([10]);
  });

  it("een niet-groepslid ziet hetzelfde gedeelde bestand niet", async () => {
    const { payload } = maakFakePayload({
      "trainer-deelgroepen": [groepFixture({ id: 10, leden: [TRAINER.id] })],
      "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: ANDERE_TRAINER.id, zichtbaarheid: "gedeeld", deelgroepen: [10] })],
    });
    const lijst = await haalMetMijGedeeldeBestanden(payload, DERDE_TRAINER);
    expect(lijst).toHaveLength(0);
  });

  it("een trainer die (nu) aan de groep is toegevoegd, ziet een al bestaand gedeeld bestand", async () => {
    const { payload } = maakFakePayload({
      "trainer-deelgroepen": [groepFixture({ id: 10, leden: [ANDERE_TRAINER.id, DERDE_TRAINER.id] })], // DERDE_TRAINER inmiddels lid
      "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: ANDERE_TRAINER.id, zichtbaarheid: "gedeeld", deelgroepen: [10] })],
    });
    const lijst = await haalMetMijGedeeldeBestanden(payload, DERDE_TRAINER);
    expect(lijst.map((b) => b.id)).toEqual([1]);
  });

  it("een trainer die uit de groep is gehaald, verliest toegang tot hetzelfde bestand (geen kopie/cache)", async () => {
    const { payload } = maakFakePayload({
      "trainer-deelgroepen": [groepFixture({ id: 10, leden: [ANDERE_TRAINER.id] })], // DERDE_TRAINER niet (meer) lid
      "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: ANDERE_TRAINER.id, zichtbaarheid: "gedeeld", deelgroepen: [10] })],
    });
    const lijst = await haalMetMijGedeeldeBestanden(payload, DERDE_TRAINER);
    expect(lijst).toHaveLength(0);
  });

  it("een inactieve groep telt niet mee, ook al is de trainer nog lid", async () => {
    const { payload } = maakFakePayload({
      "trainer-deelgroepen": [groepFixture({ id: 10, leden: [TRAINER.id], actief: false })],
      "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: ANDERE_TRAINER.id, zichtbaarheid: "gedeeld", deelgroepen: [10] })],
    });
    const lijst = await haalMetMijGedeeldeBestanden(payload, TRAINER);
    expect(lijst).toHaveLength(0);
  });

  it("een eigen bestand, ook al met een eigen groep gedeeld, staat nooit onder 'Met mij gedeeld' (dat hoort onder 'Mijn bestanden')", async () => {
    const { payload } = maakFakePayload({
      "trainer-deelgroepen": [groepFixture({ id: 10, leden: [TRAINER.id] })],
      "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: TRAINER.id, zichtbaarheid: "gedeeld", deelgroepen: [10] })],
    });
    const lijst = await haalMetMijGedeeldeBestanden(payload, TRAINER);
    expect(lijst).toHaveLength(0);
  });

  it("een privé bestand van een andere trainer verschijnt nooit, ook niet voor een groepslid", async () => {
    const { payload } = maakFakePayload({
      "trainer-deelgroepen": [groepFixture({ id: 10, leden: [TRAINER.id] })],
      "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: ANDERE_TRAINER.id, zichtbaarheid: "prive", deelgroepen: [] })],
    });
    const lijst = await haalMetMijGedeeldeBestanden(payload, TRAINER);
    expect(lijst).toHaveLength(0);
  });
});

describe("haalSchoolBestanden — §16", () => {
  it("geeft null terug als de trainer niet (meer) aan de school gekoppeld is", async () => {
    mockSchoolDetail.mockResolvedValue(null);
    const { payload } = maakFakePayload({ "trainer-bestanden": [schoolBestandFixture()] });
    const resultaat = await haalSchoolBestanden(payload, TRAINER, "school-1");
    expect(resultaat).toBeNull();
  });

  it("toont uitsluitend de bestanden van díe school, niet van een andere school of algemene bestanden", async () => {
    mockSchoolDetail.mockResolvedValue({ id: "school-1", naam: "De Wilgenhof" } as never);
    const { payload } = maakFakePayload({
      "trainer-bestanden": [
        schoolBestandFixture({ id: 1, mondaySchoolId: "school-1" }),
        schoolBestandFixture({ id: 2, mondaySchoolId: "ANDERE-SCHOOL" }),
        algemeenBestandFixture({ id: 3 }),
      ],
    });
    const resultaat = await haalSchoolBestanden(payload, TRAINER, "school-1");
    expect(resultaat?.map((b) => b.id)).toEqual([1]);
  });

  it("een school zonder trainingen kan gewoon bestanden hebben", async () => {
    mockSchoolDetail.mockResolvedValue({ id: "school-leeg", naam: "Nieuwe school", trainingen: {} } as never);
    const { payload } = maakFakePayload({ "trainer-bestanden": [schoolBestandFixture({ mondaySchoolId: "school-leeg" })] });
    const resultaat = await haalSchoolBestanden(payload, TRAINER, "school-leeg");
    expect(resultaat).toHaveLength(1);
  });
});

describe("magTrainerBestandZien — centrale autorisatie", () => {
  it("de eigenaar mag zijn eigen bestand altijd zien, ongeacht scope", async () => {
    const { payload } = maakFakePayload({});
    const bestand = { ...schoolBestandFixture(), uploaderId: TRAINER.id } as never;
    expect(await magTrainerBestandZien(payload, TRAINER, bestand)).toBe(true);
  });

  it("schoolbestand: gekoppelde trainer mag zien", async () => {
    mockScholenVoorTrainer.mockResolvedValue({ bevestigd: [{ id: "school-1" }] as never, mogelijkGekoppeld: [] });
    const { payload } = maakFakePayload({});
    const bestand = { id: 1, scope: "school", mondaySchoolId: "school-1", uploaderId: ANDERE_TRAINER.id, deelgroepen: [] } as never;
    expect(await magTrainerBestandZien(payload, TRAINER, bestand)).toBe(true);
  });

  it("schoolbestand: niet-gekoppelde trainer mag niet zien", async () => {
    mockScholenVoorTrainer.mockResolvedValue({ bevestigd: [], mogelijkGekoppeld: [] });
    const { payload } = maakFakePayload({});
    const bestand = { id: 1, scope: "school", mondaySchoolId: "school-1", uploaderId: ANDERE_TRAINER.id, deelgroepen: [] } as never;
    expect(await magTrainerBestandZien(payload, TRAINER, bestand)).toBe(false);
  });

  it("algemeen bestand, privé: niet-eigenaar mag niet zien", async () => {
    const { payload } = maakFakePayload({});
    const bestand = { id: 1, scope: "trainer", zichtbaarheid: "prive", uploaderId: ANDERE_TRAINER.id, deelgroepen: [] } as never;
    expect(await magTrainerBestandZien(payload, TRAINER, bestand)).toBe(false);
  });

  it("algemeen bestand, gedeeld: groepslid mag zien", async () => {
    const { payload } = maakFakePayload({ "trainer-deelgroepen": [groepFixture({ id: 10, leden: [TRAINER.id] })] });
    const bestand = { id: 1, scope: "trainer", zichtbaarheid: "gedeeld", uploaderId: ANDERE_TRAINER.id, deelgroepen: [{ id: 10, naam: "X" }] } as never;
    expect(await magTrainerBestandZien(payload, TRAINER, bestand)).toBe(true);
  });

  it("algemeen bestand, gedeeld: niet-groepslid mag niet zien", async () => {
    const { payload } = maakFakePayload({ "trainer-deelgroepen": [groepFixture({ id: 10, leden: [ANDERE_TRAINER.id] })] });
    const bestand = { id: 1, scope: "trainer", zichtbaarheid: "gedeeld", uploaderId: ANDERE_TRAINER.id, deelgroepen: [{ id: 10, naam: "X" }] } as never;
    expect(await magTrainerBestandZien(payload, TRAINER, bestand)).toBe(false);
  });
});

describe("genereerTrainerBestandDownloadUrl — §13 geautoriseerde download", () => {
  it("niet-bestaand bestand geeft niet_gevonden", async () => {
    const { payload } = maakFakePayload({});
    const uitkomst = await genereerTrainerBestandDownloadUrl(payload, TRAINER, 999);
    expect(uitkomst).toEqual({ soort: "niet_gevonden" });
  });

  it("bestaand bestand zonder toegang geeft geen_toegang, genereert geen URL", async () => {
    const { payload } = maakFakePayload({ "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: ANDERE_TRAINER.id, zichtbaarheid: "prive" })] });
    const uitkomst = await genereerTrainerBestandDownloadUrl(payload, TRAINER, 1);
    expect(uitkomst).toEqual({ soort: "geen_toegang" });
    expect(mockDownloadUrl).not.toHaveBeenCalled();
  });

  it("de eigenaar krijgt een signed download-URL voor exact de opgeslagen storageKey", async () => {
    mockDownloadUrl.mockResolvedValue("https://signed.example/x");
    const { payload } = maakFakePayload({ "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: TRAINER.id, storageKey: "trainer-bestanden/uniek.pptx" })] });
    const uitkomst = await genereerTrainerBestandDownloadUrl(payload, TRAINER, 1);
    expect(uitkomst).toEqual({ soort: "ok", url: "https://signed.example/x", bestand: expect.objectContaining({ id: 1 }) });
    expect(mockDownloadUrl).toHaveBeenCalledWith("trainer-bestanden/uniek.pptx");
  });
});

describe("genereerBestandDownloadUrlAlsAdmin — §13 admin mag altijd downloaden", () => {
  it("geeft null voor een niet-bestaand bestand", async () => {
    const { payload } = maakFakePayload({});
    expect(await genereerBestandDownloadUrlAlsAdmin(payload, 999)).toBeNull();
  });

  it("geeft een signed URL, ongeacht scope/eigenaar (geen autorisatiecheck — de route zelf verifieert al isEditor)", async () => {
    mockDownloadUrl.mockResolvedValue("https://signed.example/admin");
    const { payload } = maakFakePayload({ "trainer-bestanden": [schoolBestandFixture({ id: 1, uploader: ANDERE_TRAINER.id })] });
    expect(await genereerBestandDownloadUrlAlsAdmin(payload, 1)).toBe("https://signed.example/admin");
  });
});

describe("magTrainerBestandVerwijderen / verwijderTrainerBestand — §7", () => {
  it("een trainer mag nooit andermans bestand verwijderen", async () => {
    const bestand = { ...algemeenBestandFixture(), uploaderId: ANDERE_TRAINER.id, deelgroepen: [] } as never;
    expect(await magTrainerBestandVerwijderen(TRAINER, bestand)).toBe(false);
  });

  it("een trainer mag zijn eigen algemene bestand altijd verwijderen", async () => {
    const bestand = { ...algemeenBestandFixture(), uploaderId: TRAINER.id, deelgroepen: [] } as never;
    expect(await magTrainerBestandVerwijderen(TRAINER, bestand)).toBe(true);
  });

  it("een trainer mag zijn eigen schoolbestand verwijderen zolang hij nog aan de school gekoppeld is", async () => {
    mockScholenVoorTrainer.mockResolvedValue({ bevestigd: [{ id: "school-1" }] as never, mogelijkGekoppeld: [] });
    const bestand = { ...schoolBestandFixture(), uploaderId: TRAINER.id, mondaySchoolId: "school-1" } as never;
    expect(await magTrainerBestandVerwijderen(TRAINER, bestand)).toBe(true);
  });

  it("een trainer mag zijn eigen schoolbestand NIET meer verwijderen als hij niet meer aan de school gekoppeld is", async () => {
    mockScholenVoorTrainer.mockResolvedValue({ bevestigd: [], mogelijkGekoppeld: [] });
    const bestand = { ...schoolBestandFixture(), uploaderId: TRAINER.id, mondaySchoolId: "school-1" } as never;
    expect(await magTrainerBestandVerwijderen(TRAINER, bestand)).toBe(false);
  });

  it("een groepslid mag een gedeeld bestand NIET verwijderen — alleen leesrecht volgt uit groepslidmaatschap", async () => {
    const { payload, collection } = maakFakePayload({
      "trainer-deelgroepen": [groepFixture({ id: 10, leden: [TRAINER.id] })],
      "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: ANDERE_TRAINER.id, zichtbaarheid: "gedeeld", deelgroepen: [10] })],
    });
    const uitkomst = await verwijderTrainerBestand(payload, TRAINER, 1);
    expect(uitkomst).toBe("geen_toegang");
    expect(collection("trainer-bestanden")).toHaveLength(1); // niets verwijderd
  });

  it("verwijderen van een niet-bestaand bestand geeft niet_gevonden", async () => {
    const { payload } = maakFakePayload({});
    expect(await verwijderTrainerBestand(payload, TRAINER, 999)).toBe("niet_gevonden");
  });

  it("verwijdert het bestand daadwerkelijk uit de collectie bij toegestane verwijdering", async () => {
    const { payload, collection } = maakFakePayload({ "trainer-bestanden": [algemeenBestandFixture({ id: 1, uploader: TRAINER.id })] });
    const uitkomst = await verwijderTrainerBestand(payload, TRAINER, 1);
    expect(uitkomst).toBe("ok");
    expect(collection("trainer-bestanden")).toHaveLength(0);
  });
});
