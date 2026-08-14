import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { beslisOverVoorstel } from "./proposals";
import { schrijfDatumVolgendeActieTerug, schrijfTypeSchoolTerug } from "./writeback";

vi.mock("./writeback", () => ({
  schrijfDatumVolgendeActieTerug: vi.fn(),
  schrijfTypeSchoolTerug: vi.fn(),
}));
const mockSchrijfDatum = vi.mocked(schrijfDatumVolgendeActieTerug);
const mockSchrijfType = vi.mocked(schrijfTypeSchoolTerug);

const mockFindByID = vi.fn();
const mockFind = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

function maakPayload(): Payload {
  return { findByID: mockFindByID, find: mockFind, create: mockCreate, update: mockUpdate } as unknown as Payload;
}

beforeEach(() => {
  mockFindByID.mockReset();
  mockFind.mockReset();
  mockCreate.mockReset().mockResolvedValue({ id: 900 });
  mockUpdate.mockReset();
  mockSchrijfDatum.mockReset().mockResolvedValue({ status: "geschreven", boodschap: "ok" });
  mockSchrijfType.mockReset().mockResolvedValue({ status: "geschreven", boodschap: "ok" });
});

const VOORSTEL_VOLGENDE_ACTIE = {
  id: 1,
  school: 42,
  status: "pending",
  proposalType: "volgende_actie",
  proposalText: "Bel de school over de demo.",
  proposedDate: "2026-09-01",
  proposedType: "bellen",
  proposedChannel: "telefoon",
};
const SCHOOL = { id: 42, mondayItemId: "12770146980" };

describe("beslisOverVoorstel — accepted (volgende_actie)", () => {
  beforeEach(() => {
    mockFindByID.mockImplementation(({ collection, id }: { collection: string; id: number }) => {
      if (collection === "sales-proposals") return Promise.resolve(VOORSTEL_VOLGENDE_ACTIE);
      if (collection === "sales-schools") return Promise.resolve(SCHOOL);
      return Promise.resolve(null);
    });
  });

  it("maakt een open sales-actions-record aan met de voorgestelde datum/type", async () => {
    await beslisOverVoorstel(maakPayload(), 1, { beslissing: "accepted", gebruikerId: 7 });

    const actieCall = mockCreate.mock.calls.find((c) => c[0].collection === "sales-actions")![0];
    expect(actieCall.data).toMatchObject({ school: 42, type: "bellen", dueDate: "2026-09-01", status: "open", createdBy: 7 });
  });

  it("zet het voorstel op status 'accepted' en koppelt resultingAction — bewaart het oorspronkelijke voorstel ongewijzigd", async () => {
    await beslisOverVoorstel(maakPayload(), 1, { beslissing: "accepted", gebruikerId: 7 });

    const updateCall = mockUpdate.mock.calls.find((c) => c[0].collection === "sales-proposals")![0];
    expect(updateCall.data.status).toBe("accepted");
    expect(updateCall.data.finalChoice).toBeNull(); // geen afwijkende keuze — origineel voorstel blijft het "definitieve" antwoord
    expect(updateCall.data.resultingAction).toBe(900);
  });

  it("triggert automatisch de write-back van Datum volgende actie — geen aparte bevestigingsstap (bevestigd)", async () => {
    await beslisOverVoorstel(maakPayload(), 1, { beslissing: "accepted", gebruikerId: 7 });

    expect(mockSchrijfDatum).toHaveBeenCalledWith(expect.anything(), 42, "12770146980", "2026-09-01", 7, 1, 900);
  });
});

describe("beslisOverVoorstel — modified: bewaart origineel voorstel EN definitieve keuze (audit)", () => {
  beforeEach(() => {
    mockFindByID.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-proposals") return Promise.resolve(VOORSTEL_VOLGENDE_ACTIE);
      if (collection === "sales-schools") return Promise.resolve(SCHOOL);
      return Promise.resolve(null);
    });
  });

  it("gebruikt de aangepaste datum voor de actie, maar de oorspronkelijke proposedDate blijft ongewijzigd in het voorstel-record", async () => {
    await beslisOverVoorstel(maakPayload(), 1, {
      beslissing: "modified",
      gebruikerId: 7,
      aangepasteWaarde: { proposedDate: "2026-09-15", proposedType: "mail" },
    });

    const actieCall = mockCreate.mock.calls.find((c) => c[0].collection === "sales-actions")![0];
    expect(actieCall.data.dueDate).toBe("2026-09-15");
    expect(actieCall.data.type).toBe("mail");

    const updateCall = mockUpdate.mock.calls.find((c) => c[0].collection === "sales-proposals")![0];
    expect(updateCall.data.status).toBe("modified");
    expect(updateCall.data.finalChoice).toEqual({ proposedDate: "2026-09-15", proposedType: "mail" });
    // Het origineel (VOORSTEL_VOLGENDE_ACTIE.proposedDate = "2026-09-01") wordt NERGENS overschreven in deze update-call.
    expect(updateCall.data.proposedDate).toBeUndefined();
  });
});

describe("beslisOverVoorstel — rejected", () => {
  it("zet status op 'rejected', maakt geen sales-actions-record en logt de afwijzing", async () => {
    mockFindByID.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-proposals") return Promise.resolve(VOORSTEL_VOLGENDE_ACTIE);
      if (collection === "sales-schools") return Promise.resolve(SCHOOL);
      return Promise.resolve(null);
    });

    await beslisOverVoorstel(maakPayload(), 1, { beslissing: "rejected", gebruikerId: 7 });

    expect(mockCreate).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-actions" }));
    const updateCall = mockUpdate.mock.calls.find((c) => c[0].collection === "sales-proposals")![0];
    expect(updateCall.data.status).toBe("rejected");
    const logCall = mockCreate.mock.calls.find((c) => c[0].collection === "sales-log-events")![0];
    expect(logCall.data.summary).toContain("afgewezen");
  });
});

describe("beslisOverVoorstel — veld_correctie triggert Type-school write-back, nooit Relatiestatus/Salesfase", () => {
  it("roept schrijfTypeSchoolTerug aan met de voorgestelde waarde en de proposal-time-snapshot", async () => {
    const veldVoorstel = { id: 2, school: 42, status: "pending", proposalType: "veld_correctie", proposalText: 'Type school lijkt "Montessori"', proposedValue: "Montessori", mondayValueAtProposalTime: null };
    mockFindByID.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-proposals") return Promise.resolve(veldVoorstel);
      if (collection === "sales-schools") return Promise.resolve(SCHOOL);
      return Promise.resolve(null);
    });

    await beslisOverVoorstel(maakPayload(), 2, { beslissing: "accepted", gebruikerId: 7 });

    expect(mockSchrijfType).toHaveBeenCalledWith(expect.anything(), 42, "12770146980", "Montessori", null, 7, 2);
    expect(mockSchrijfDatum).not.toHaveBeenCalled();
    // Geen enkele aanroep raakt Relatiestatus of Salesfase aan — die kolommen komen nergens in dit pad voor.
    expect(mockCreate).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-actions" }));
  });
});

describe("beslisOverVoorstel — al afgehandeld voorstel", () => {
  it("weigert een tweede keer te beslissen over een al geaccepteerd voorstel", async () => {
    mockFindByID.mockResolvedValue({ id: 1, school: 42, status: "accepted", proposalType: "volgende_actie" });

    await expect(beslisOverVoorstel(maakPayload(), 1, { beslissing: "accepted", gebruikerId: 7 })).rejects.toThrow(/al afgehandeld/);
  });
});
