import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { registreerGesteldeVraag, normaliseerVraag } from "./registreer-gestelde-vraag";

const mockFind = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

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
describe("registreerGesteldeVraag", () => {
  it("maakt een nieuw record aan als de vraag nog niet bestaat", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 1 });

    await registreerGesteldeVraag(maakPayload(), "Hoe maak ik een doelenset aan?");

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "helpdesk-vragen",
        where: { vraagNormalized: { equals: "hoe maak ik een doelenset aan?" } },
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
        }),
      })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("verhoogt het bestaande aantal en de laatst-gebruikt-datum bij een al bekende vraag (case-insensitief)", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 42, aantalGesteld: 3 }] });

    await registreerGesteldeVraag(maakPayload(), "hoe maak ik een DOELENSET aan?");

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
    await registreerGesteldeVraag(maakPayload(), "   ");

    expect(mockFind).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("faalt non-blocking: een databasefout wordt gevangen, nooit doorgegooid", async () => {
    mockFind.mockRejectedValue(new Error("DB-fout"));

    await expect(registreerGesteldeVraag(maakPayload(), "Een vraag")).resolves.toBeUndefined();
  });
});
