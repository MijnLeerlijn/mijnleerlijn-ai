import { describe, it, expect } from "vitest";
import { variantPublicUrl } from "./variant-public-url";
import type { Variant } from "@/types/variant";

function maakVariant(overrides: Partial<Variant["domain"]>): Variant {
  return {
    id: "2",
    slug: "mijnmonti",
    name: "MijnMonti",
    status: "actief",
    actief: true,
    domain: { type: "slug_path", value: "mijnmonti", domainStatus: "slug_path", ...overrides },
    branding: {
      logoUrl: "/brand/logo-kleur.svg",
      accentColor: "#1588c9",
      productName: "MijnMonti",
      tagline: "",
      isPlaceholder: true,
    },
    educationType: "montessori",
    terminologyDictionary: [],
    websiteTeksten: {
      welkomsttitel: "",
      welkomsttekst: "",
      zoekveldPlaceholder: "",
      helpdeskIntro: "",
      contactTekst: "",
      footerTekst: "",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "system",
  };
}

describe("variantPublicUrl", () => {
  it("bouwt de URL voor een eigen domein (custom_domain)", () => {
    const variant = maakVariant({ type: "custom_domain", value: "mijnmonti.nl" });
    expect(variantPublicUrl(variant)).toBe("https://mijnmonti.nl");
  });

  it("bouwt de URL voor een subdomein t.o.v. het hoofddomein van de standaardvariant", () => {
    const variant = maakVariant({ type: "subdomain", value: "mijnmonti" });
    expect(variantPublicUrl(variant)).toBe("https://mijnmonti.mijnleerlijn.chat");
  });

  it("bouwt óók de subdomein-URL voor domain.type slug_path — dat is nu de canonieke vorm, de padvorm is alleen nog een redirect-alias (zie proxy.ts)", () => {
    const variant = maakVariant({ type: "slug_path", value: "mijnmonti" });
    expect(variantPublicUrl(variant)).toBe("https://mijnmonti.mijnleerlijn.chat");
  });
});
