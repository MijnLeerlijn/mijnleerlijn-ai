import { describe, it, expect } from "vitest";
import { findRelatedDraftIds } from "./link-drafts";
import { maakFakePayload } from "@/lib/support/fake-payload";

describe("findRelatedDraftIds", () => {
  it("vindt alle bestaande concepten met voldoende trefwoordoverlap (kan er meerdere zijn)", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        {
          id: 1,
          title: "Hoofdprofiel aanmaken",
          category: "profielen",
          keywords: ["hoofdprofiel", "aanmaken"],
        },
        {
          id: 2,
          title: "Hoofdprofiel verwijderen",
          category: "profielen",
          keywords: ["hoofdprofiel", "verwijderen"],
        },
        { id: 3, title: "Facturatie-instellingen wijzigen", category: "facturatie", keywords: ["factuur"] },
      ],
    });

    const gevonden = await findRelatedDraftIds(payload, {
      title: "Handleiding hoofdprofiel beheren",
      category: "profielen",
      keywords: ["hoofdprofiel"],
    });

    expect(gevonden.sort()).toEqual([1, 2]);
  });

  it("geeft een lege lijst terug bij onvoldoende overlap", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        { id: 1, title: "Wachtwoord resetten", category: "account", keywords: ["wachtwoord"] },
      ],
    });

    const gevonden = await findRelatedDraftIds(payload, {
      title: "Rapportage exporteren",
      category: "rapportages",
      keywords: ["export", "pdf"],
    });

    expect(gevonden).toEqual([]);
  });

  it("geeft een lege lijst terug wanneer er nog geen concepten bestaan", async () => {
    const { payload } = maakFakePayload({});
    const gevonden = await findRelatedDraftIds(payload, { title: "Iets", category: "cat", keywords: [] });
    expect(gevonden).toEqual([]);
  });
});
