import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { bepaalProposalVoorkeur } from "./proposal-preferences";

const mockFind = vi.fn();
function maakPayload(): Payload {
  return { find: mockFind } as unknown as Payload;
}

beforeEach(() => {
  mockFind.mockReset();
});

describe("bepaalProposalVoorkeur", () => {
  it("geeft null/0 terug zonder beslist geschiedenis — geen crash op een lege dataset", async () => {
    mockFind.mockResolvedValue({ docs: [] });

    const voorkeur = await bepaalProposalVoorkeur(maakPayload());

    expect(voorkeur).toEqual({ mediaanDagenTotVervolgactie: null, meestGekozenKanaal: null, aantalVoorstellenGebruikt: 0 });
  });

  it("bevraagt uitsluitend geaccepteerde/aangepaste volgende_actie-voorstellen", async () => {
    mockFind.mockResolvedValue({ docs: [] });

    await bepaalProposalVoorkeur(maakPayload());

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "sales-proposals",
        where: { proposalType: { equals: "volgende_actie" }, status: { in: ["accepted", "modified"] } },
      })
    );
  });

  it("berekent de mediaan van dagen tussen voorstel-createdAt en de uiteindelijk gekozen datum", async () => {
    mockFind.mockResolvedValue({
      docs: [
        { createdAt: "2026-08-01T00:00:00.000Z", proposedDate: "2026-08-11", proposedChannel: "mail" }, // 10 dagen
        { createdAt: "2026-08-01T00:00:00.000Z", proposedDate: "2026-08-09", proposedChannel: "mail" }, // 8 dagen
        { createdAt: "2026-08-01T00:00:00.000Z", proposedDate: "2026-08-13", proposedChannel: "telefoon" }, // 12 dagen
      ],
    });

    const voorkeur = await bepaalProposalVoorkeur(maakPayload());

    expect(voorkeur.mediaanDagenTotVervolgactie).toBe(10); // mediaan van [8, 10, 12]
    expect(voorkeur.aantalVoorstellenGebruikt).toBe(3);
  });

  it("gebruikt finalChoice (de daadwerkelijke keuze bij 'modified') i.p.v. het oorspronkelijke AI-voorstel", async () => {
    mockFind.mockResolvedValue({
      docs: [
        {
          createdAt: "2026-08-01T00:00:00.000Z",
          proposedDate: "2026-08-05", // AI stelde 4 dagen voor
          proposedChannel: "mail",
          finalChoice: { proposedDate: "2026-08-15", proposedChannel: "telefoon" }, // Michel koos 14 dagen, telefoon
        },
      ],
    });

    const voorkeur = await bepaalProposalVoorkeur(maakPayload());

    expect(voorkeur.mediaanDagenTotVervolgactie).toBe(14);
    expect(voorkeur.meestGekozenKanaal).toBe("telefoon");
  });

  it("bepaalt het meest gekozen kanaal via een simpele telling", async () => {
    mockFind.mockResolvedValue({
      docs: [
        { createdAt: "2026-08-01T00:00:00.000Z", proposedDate: "2026-08-05", proposedChannel: "mail" },
        { createdAt: "2026-08-01T00:00:00.000Z", proposedDate: "2026-08-05", proposedChannel: "mail" },
        { createdAt: "2026-08-01T00:00:00.000Z", proposedDate: "2026-08-05", proposedChannel: "telefoon" },
      ],
    });

    const voorkeur = await bepaalProposalVoorkeur(maakPayload());

    expect(voorkeur.meestGekozenKanaal).toBe("mail");
  });

  it("negeert voorstellen zonder bruikbare datum voor de mediaanberekening, telt ze wel mee in aantalVoorstellenGebruikt", async () => {
    mockFind.mockResolvedValue({
      docs: [
        { createdAt: "2026-08-01T00:00:00.000Z", proposedDate: null, proposedChannel: null },
        { createdAt: "2026-08-01T00:00:00.000Z", proposedDate: "2026-08-11", proposedChannel: "mail" },
      ],
    });

    const voorkeur = await bepaalProposalVoorkeur(maakPayload());

    expect(voorkeur.mediaanDagenTotVervolgactie).toBe(10);
    expect(voorkeur.aantalVoorstellenGebruikt).toBe(2);
  });
});
