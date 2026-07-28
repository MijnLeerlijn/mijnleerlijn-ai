import { describe, it, expect, vi } from "vitest";
import type { Payload } from "payload";
import { haalCentraleKennisbasisOp } from "./kennisbasis-context";
import { tekstNaarRichText } from "./kennisbasis-richtext";

function maakPayload(findGlobalResultaat: unknown): Payload {
  return {
    findGlobal: vi.fn().mockResolvedValue(findGlobalResultaat),
  } as unknown as Payload;
}

describe("haalCentraleKennisbasisOp", () => {
  it("geeft gestructureerde tekst + versie terug voor een gepubliceerde Global", async () => {
    const richText = tekstNaarRichText("**Kop**\n- item een\n- item twee");
    const payload = maakPayload({
      _status: "published",
      inhoud: richText,
      updatedAt: "2026-07-28T10:00:00.000Z",
    });

    const resultaat = await haalCentraleKennisbasisOp(payload);

    expect(resultaat).not.toBeNull();
    expect(resultaat?.tekst).toContain("## Kop");
    expect(resultaat?.tekst).toContain("- item een\n- item twee");
    expect(resultaat?.versie).toBe("2026-07-28T10:00:00.000Z");
    expect(payload.findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "kennisbasis-mijnleerlijn", draft: false, overrideAccess: true })
    );
  });

  it("geeft null terug wanneer de Global nog nooit gepubliceerd is (alleen concept of leeg)", async () => {
    const payload = maakPayload({ _status: "draft", inhoud: tekstNaarRichText("Concepttekst.") });
    expect(await haalCentraleKennisbasisOp(payload)).toBeNull();
  });

  it("geeft null terug wanneer de Global nog nooit is opgeslagen (geen _status)", async () => {
    const payload = maakPayload({});
    expect(await haalCentraleKennisbasisOp(payload)).toBeNull();
  });

  it("geeft null terug bij lege inhoud, ook als de status 'published' is", async () => {
    const payload = maakPayload({ _status: "published", inhoud: { root: { children: [] } } });
    expect(await haalCentraleKennisbasisOp(payload)).toBeNull();
  });

  it("faalt nooit hard: geeft null terug bij een databasefout", async () => {
    const payload = { findGlobal: vi.fn().mockRejectedValue(new Error("db weg")) } as unknown as Payload;
    expect(await haalCentraleKennisbasisOp(payload)).toBeNull();
  });
});
