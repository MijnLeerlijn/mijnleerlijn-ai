import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFind = vi.fn();

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({ find: mockFind }) }));
vi.mock("@/payload.config", () => ({ default: {} }));

function maakVariantDoc(overrides: Partial<{
  slug: string;
  domainType: "custom_domain" | "subdomain" | "slug_path";
  domainValue: string;
  actief: boolean;
}>) {
  return {
    slug: overrides.slug ?? "mijnleerlijn",
    domain: { type: overrides.domainType ?? "custom_domain", value: overrides.domainValue ?? "mijnleerlijn.chat" },
    actief: overrides.actief ?? true,
  };
}

// Multi-brand variants (2026-07-30): getest tegen de concrete implementatie
// (niet tegen proxy.ts, die roept alleen de VariantResolver-interface aan).
// vi.resetModules() + dynamische import per test: de module houdt een
// module-scope TTL-cache bij, elke test heeft een eigen, schone instantie
// nodig om cache-lekkage tussen tests te voorkomen.
describe("InMemoryVariantResolver", () => {
  beforeEach(() => {
    mockFind.mockReset();
    vi.resetModules();
  });

  async function maakResolver() {
    const { InMemoryVariantResolver } = await import("./in-memory-variant-resolver");
    return new InMemoryVariantResolver();
  }

  it("matcht op custom_domain", async () => {
    mockFind.mockResolvedValue({
      docs: [
        maakVariantDoc({ slug: "mijnleerlijn", domainType: "custom_domain", domainValue: "mijnleerlijn.chat" }),
      ],
    });
    const resolver = await maakResolver();
    expect(await resolver.resolveSlug("mijnleerlijn.chat", "/")).toBe("mijnleerlijn");
  });

  it("matcht op subdomein t.o.v. het hoofddomein van de standaardvariant", async () => {
    mockFind.mockResolvedValue({
      docs: [
        maakVariantDoc({ slug: "mijnleerlijn", domainType: "custom_domain", domainValue: "mijnleerlijn.chat" }),
        maakVariantDoc({ slug: "mijnmonti", domainType: "subdomain", domainValue: "mijnmonti", actief: true }),
      ],
    });
    const resolver = await maakResolver();
    expect(await resolver.resolveSlug("mijnmonti.mijnleerlijn.chat", "/")).toBe("mijnmonti");
  });

  it("matcht op pad-gebaseerde slug-fallback", async () => {
    mockFind.mockResolvedValue({
      docs: [
        maakVariantDoc({ slug: "mijnleerlijn", domainType: "custom_domain", domainValue: "mijnleerlijn.chat" }),
        maakVariantDoc({ slug: "mijnd", domainType: "slug_path", domainValue: "mijnd", actief: true }),
      ],
    });
    const resolver = await maakResolver();
    expect(await resolver.resolveSlug("mijnleerlijn.chat", "/mijnd/iets")).toBe("mijnd");
  });

  it("valt terug op de standaardvariant zonder enige match", async () => {
    mockFind.mockResolvedValue({
      docs: [maakVariantDoc({ slug: "mijnleerlijn", domainType: "custom_domain", domainValue: "mijnleerlijn.chat" })],
    });
    const resolver = await maakResolver();
    expect(await resolver.resolveSlug("onbekende-host.example", "/")).toBe("mijnleerlijn");
  });

  it("slaat een niet-actieve variant over en valt terug op de standaardvariant", async () => {
    mockFind.mockResolvedValue({
      docs: [
        maakVariantDoc({ slug: "mijnleerlijn", domainType: "custom_domain", domainValue: "mijnleerlijn.chat" }),
        maakVariantDoc({ slug: "mijnd", domainType: "slug_path", domainValue: "mijnd", actief: false }),
      ],
    });
    const resolver = await maakResolver();
    expect(await resolver.resolveSlug("mijnleerlijn.chat", "/mijnd/iets")).toBe("mijnleerlijn");
  });

  it("behandelt de standaardvariant zelf altijd als geldig, ook met actief=false", async () => {
    mockFind.mockResolvedValue({
      docs: [
        maakVariantDoc({ slug: "mijnleerlijn", domainType: "custom_domain", domainValue: "mijnleerlijn.chat", actief: false }),
      ],
    });
    const resolver = await maakResolver();
    expect(await resolver.resolveSlug("mijnleerlijn.chat", "/")).toBe("mijnleerlijn");
  });

  it("valt terug op de standaardvariant wanneer de opzoeking faalt", async () => {
    mockFind.mockRejectedValue(new Error("DB onbereikbaar"));
    const resolver = await maakResolver();
    expect(await resolver.resolveSlug("mijnleerlijn.chat", "/")).toBe("mijnleerlijn");
  });

  it("cachet het resultaat — een tweede aanroep binnen de TTL doet geen nieuwe find()-aanroep", async () => {
    mockFind.mockResolvedValue({
      docs: [maakVariantDoc({ slug: "mijnleerlijn", domainType: "custom_domain", domainValue: "mijnleerlijn.chat" })],
    });
    const resolver = await maakResolver();
    await resolver.resolveSlug("mijnleerlijn.chat", "/");
    await resolver.resolveSlug("mijnleerlijn.chat", "/");
    expect(mockFind).toHaveBeenCalledTimes(1);
  });
});
