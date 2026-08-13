import { describe, it, expect, vi } from "vitest";
import type { Payload } from "payload";
import { keurMailKennisstukGoed } from "./approve-mail-knowledge";

function maakFakePayload(kennisstukId: number) {
  return {
    create: vi.fn().mockResolvedValue({ id: kennisstukId }),
    update: vi.fn().mockResolvedValue({}),
  } as unknown as Payload;
}

describe("keurMailKennisstukGoed", () => {
  it("maakt het kennisstuk aan met overrideAccess, origin creator-mail en de mail-koppeling", async () => {
    const payload = maakFakePayload(42);

    const resultaat = await keurMailKennisstukGoed(payload, {
      mailDraftId: 7,
      title: "Hoe voeg ik een leerling toe?",
      question: "Hoe voeg ik een leerling toe?",
      shortAnswer: "Via het dashboard.",
      fullAnswer: "Ga naar Leerlingen > Toevoegen.",
      customerSpecificInformationFound: false,
    });

    expect(resultaat).toEqual({ id: 42 });
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "knowledge-drafts",
        overrideAccess: true,
        draft: false,
        data: expect.objectContaining({
          origin: "creator-mail",
          sourceMailDraft: 7,
          status: "review",
          embeddingStatus: "pending",
          title: "Hoe voeg ik een leerling toe?",
        }),
      })
    );
  });

  it("koppelt het net aangemaakte kennisstuk terug aan het mailconcept en zet status op afgehandeld", async () => {
    const payload = maakFakePayload(99);

    await keurMailKennisstukGoed(payload, {
      mailDraftId: 7,
      title: "T",
      question: "Q",
      shortAnswer: "S",
      fullAnswer: "F",
      customerSpecificInformationFound: true,
      customerSpecificInformationExplanation: "Bevat een schoolnaam.",
    });

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "mail-drafts",
        id: 7,
        overrideAccess: true,
        data: { linkedKnowledgeDraft: 99, status: "afgehandeld" },
      })
    );
  });

  it("werkt het mailconcept pas bij nadat het kennisstuk is aangemaakt (koppeling heeft het echte id nodig)", async () => {
    const payload = maakFakePayload(5);
    const volgorde: string[] = [];
    vi.mocked(payload.create).mockImplementation(async () => {
      volgorde.push("create");
      return { id: 5 } as never;
    });
    vi.mocked(payload.update).mockImplementation(async () => {
      volgorde.push("update");
      return {} as never;
    });

    await keurMailKennisstukGoed(payload, {
      mailDraftId: 1,
      title: "T",
      question: "Q",
      shortAnswer: "S",
      fullAnswer: "F",
      customerSpecificInformationFound: false,
    });

    expect(volgorde).toEqual(["create", "update"]);
  });
});
