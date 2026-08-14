import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { voerBackfillUit } from "./backfill";
import { haalUpdatesVoorItem } from "./monday-client";
import { generateStructuredOutput } from "@/services/ai-client";

vi.mock("./monday-client", () => ({ haalUpdatesVoorItem: vi.fn() }));
vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));
const mockHaalUpdates = vi.mocked(haalUpdatesVoorItem);
const mockGenerate = vi.mocked(generateStructuredOutput);

const mockFind = vi.fn();
const mockCreate = vi.fn();

function maakPayload(): Payload {
  return { find: mockFind, create: mockCreate } as unknown as Payload;
}

const SCHOOL_A = { id: 1, schoolName: "School A", mondayItemId: "111", mondayVolgendeActieDatum: null };
const SCHOOL_B = { id: 2, schoolName: "School B", mondayItemId: "222", mondayVolgendeActieDatum: null };

beforeEach(() => {
  mockFind.mockReset();
  mockCreate.mockReset().mockResolvedValue({ id: 500 });
  mockHaalUpdates.mockReset();
  mockGenerate.mockReset();
});

function stelFindIn(config: { openActies?: Record<number, boolean>; pendingVoorstellen?: Record<number, boolean>; betrouwbareContext?: Record<number, boolean> }) {
  mockFind.mockImplementation(({ collection, where }: { collection: string; where: Record<string, unknown> }) => {
    if (collection === "sales-schools") {
      return Promise.resolve({ docs: [SCHOOL_A, SCHOOL_B] });
    }
    if (collection === "sales-actions") {
      const schoolId = (where.school as { equals: number }).equals;
      return Promise.resolve({ docs: config.openActies?.[schoolId] ? [{ id: 1 }] : [] });
    }
    if (collection === "sales-proposals") {
      const schoolId = (where.school as { equals: number }).equals;
      return Promise.resolve({ docs: config.pendingVoorstellen?.[schoolId] ? [{ id: 1 }] : [] });
    }
    if (collection === "sales-log-events") {
      const schoolId = (where.school as { equals: number }).equals;
      return Promise.resolve({
        docs: config.betrouwbareContext?.[schoolId] ? [{ payload: { gemigreerd: false } }] : [],
      });
    }
    return Promise.resolve({ docs: [] });
  });
}

describe("voerBackfillUit — idempotentie", () => {
  it("slaat een school met een al bestaande open actie over — categorie 'vervolgactie_bestaat'", async () => {
    stelFindIn({ openActies: { 1: true, 2: true } });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.vervolgactie_bestaat).toBe(2);
    expect(mockCreate).not.toHaveBeenCalled(); // geen nieuw voorstel, geen nieuwe actie
  });

  it("slaat een school met een al bestaand pending voorstel over — geen dubbel voorstel bij een herhaalde run", async () => {
    stelFindIn({ pendingVoorstellen: { 1: true, 2: true } });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.ai_voorstel_klaar).toBe(2);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("categoriseert als 'onvoldoende_context' wanneer er geen betrouwbare lokale contactcontext is", async () => {
    stelFindIn({});

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.onvoldoende_context).toBe(2);
    expect(mockHaalUpdates).not.toHaveBeenCalled(); // geen onnodige live Monday-call zonder lokale precondition
  });

  it("maakt precies één voorstel per school aan wanneer betrouwbare context bestaat en de AI een voorstel doet", async () => {
    stelFindIn({ betrouwbareContext: { 1: true, 2: true } });
    mockHaalUpdates.mockResolvedValue([
      { id: "u1", item_id: "111", text_body: "We willen graag een demo.", created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z", creator: null },
    ]);
    mockGenerate.mockResolvedValue({
      uitkomst: "voorstel",
      voorgesteldeActie: "Demo inplannen",
      voorgesteldeDatum: "2026-08-20",
      voorgesteldType: "afspraak",
      voorgesteldKanaal: "mail",
      reden: "Ze vroegen expliciet om een demo.",
    });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.ai_voorstel_klaar).toBe(2);
    const voorstelCalls = mockCreate.mock.calls.filter((c) => c[0].collection === "sales-proposals");
    expect(voorstelCalls).toHaveLength(2);
    expect(voorstelCalls[0]![0].data.status).toBe("pending"); // NOOIT automatisch geaccepteerd
  });

  it("negeert gemigreerde Updates als brontekst voor de AI-redenering", async () => {
    stelFindIn({ betrouwbareContext: { 1: true } });
    mockFind.mockImplementationOnce(({ collection }) => (collection === "sales-schools" ? Promise.resolve({ docs: [SCHOOL_A] }) : Promise.resolve({ docs: [] })));
    stelFindIn({ betrouwbareContext: { 1: true } });
    mockHaalUpdates.mockResolvedValue([
      { id: "u1", item_id: "111", text_body: "📜 Gemigreerde CRM-gegevens (oud Sales-board)\nLaatste contact: 2026-01-01", created_at: "2026-08-08T00:00:00.000Z", updated_at: "2026-08-08T00:00:00.000Z", creator: null },
    ]);

    await voerBackfillUit(maakPayload());

    // Alle updates waren gemigreerd → geen brontekst over → onvoldoende_context, AI wordt niet aangeroepen.
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("maakt nooit een geaccepteerde actie aan — alleen pending voorstellen", async () => {
    stelFindIn({ betrouwbareContext: { 1: true, 2: true } });
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "Contact.", created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z", creator: null }]);
    mockGenerate.mockResolvedValue({ uitkomst: "voorstel", voorgesteldeActie: "Bellen", voorgesteldeDatum: "2026-08-20", voorgesteldType: "bellen", voorgesteldKanaal: "telefoon", reden: "x" });

    await voerBackfillUit(maakPayload());

    expect(mockCreate).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-actions" }));
  });

  it("respecteert een al bestaande Monday-vervolgdatum als 'bestaande_vervolgdatum'-voorstel, i.p.v. de AI te vragen iets te verzinnen", async () => {
    mockFind.mockImplementation(({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ ...SCHOOL_A, mondayVolgendeActieDatum: "2026-09-01" }] });
      if (collection === "sales-actions") return Promise.resolve({ docs: [] });
      if (collection === "sales-proposals") return Promise.resolve({ docs: [] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.ai_voorstel_klaar).toBe(1);
    expect(mockHaalUpdates).not.toHaveBeenCalled(); // geen AI-redenering nodig — de datum kwam al uit Monday
    const voorstelCall = mockCreate.mock.calls.find((c) => c[0].collection === "sales-proposals")![0];
    expect(voorstelCall.data.proposalType).toBe("bestaande_vervolgdatum");
    expect(voorstelCall.data.proposedDate).toBe("2026-09-01");
  });
});
