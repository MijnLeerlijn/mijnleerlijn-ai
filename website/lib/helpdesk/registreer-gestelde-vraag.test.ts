import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { registreerGesteldeVraag, normaliseerVraag } from "./registreer-gestelde-vraag";

const mockFind = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const VARIANT_ID = "1";

function maakPayload(): Payload {
  return {
    find: mockFind,
    create: mockCreate,
    update: mockUpdate,
  } as unknown as Payload;
}

beforeEach(() => {
  mockFind.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
});

describe("normaliseerVraag", () => {
  it("trimt, verlaagt naar kleine letters en herleidt witruimte tot enkele spaties", () => {
    expect(normaliseerVraag("  Hoe   koppel ik  Doelen?  ")).toBe("hoe koppel ik doelen?");
  });
});

// Homepage-herontwerp (2026-07-29): telt een daadwerkelijk gestelde vraag —
// zie app/api/helpdesk/ask/route.ts, aangeroepen bij elke bevestigde
// "Verstuur"-actie (klikken op een voorbeeldvraag vult alleen het
// invoerveld, zie components/organisms/HelpdeskChat.tsx).
// Multi-brand variants (2026-07-30): dezelfde vraagtekst in twee varianten
// geeft twee aparte tellingen — de match zoekt uitsluitend binnen de
// opgegeven variant.
describe("registreerGesteldeVraag", () => {
  it("maakt een nieuw record aan als de vraag nog niet bestaat binnen deze variant", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 1 });

    await registreerGesteldeVraag(maakPayload(), "Hoe maak ik een doelenset aan?", VARIANT_ID);

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "helpdesk-vragen",
        where: {
          and: [
            { vraagNormalized: { equals: "hoe maak ik een doelenset aan?" } },
            { variantContext: { equals: VARIANT_ID } },
          ],
        },
      })
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "helpdesk-vragen",
        overrideAccess: true,
        data: expect.objectContaining({
          vraag: "Hoe maak ik een doelenset aan?",
          vraagNormalized: "hoe maak ik een doelenset aan?",
          aantalGesteld: 1,
          pinned: false,
          verborgen: false,
          variantContext: [Number(VARIANT_ID)],
        }),
      })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("verhoogt het bestaande aantal en de laatst-gebruikt-datum bij een al bekende vraag binnen dezelfde variant (case-insensitief)", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 42, aantalGesteld: 3 }] });

    await registreerGesteldeVraag(maakPayload(), "hoe maak ik een DOELENSET aan?", VARIANT_ID);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "helpdesk-vragen",
        id: 42,
        overrideAccess: true,
        data: expect.objectContaining({ aantalGesteld: 4 }),
      })
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("doet niets bij een lege vraag", async () => {
    await registreerGesteldeVraag(maakPayload(), "   ", VARIANT_ID);

    expect(mockFind).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("faalt non-blocking: een databasefout wordt gevangen, nooit doorgegooid", async () => {
    mockFind.mockRejectedValue(new Error("DB-fout"));

    await expect(registreerGesteldeVraag(maakPayload(), "Een vraag", VARIANT_ID)).resolves.toBeUndefined();
  });
});
