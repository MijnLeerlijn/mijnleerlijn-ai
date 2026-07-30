import { describe, it, expect, vi, beforeEach } from "vitest";
import { headers } from "next/headers";
import { getActiveVariant } from "./get-active-variant";
import { getVariantBySlug } from "@/services/payload";
import { isProduction } from "@/config/env";
import { defaultVariant } from "@/config/variants";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/services/payload", () => ({ getVariantBySlug: vi.fn() }));
vi.mock("@/config/env", () => ({ isProduction: vi.fn() }));

const mockHeaders = vi.mocked(headers);
const mockGetVariantBySlug = vi.mocked(getVariantBySlug);
const mockIsProduction = vi.mocked(isProduction);

function maakHeaders(slug: string | null) {
  return { get: (naam: string) => (naam === "x-variant-slug" ? slug : null) } as unknown as Headers;
}

beforeEach(() => {
  mockHeaders.mockReset();
  mockGetVariantBySlug.mockReset();
  mockIsProduction.mockReset();
});

// Multi-brand variants (2026-07-30): de standaardvariant mag nooit
// onbereikbaar worden, ook niet in productie — een andere variant blijft
// wél hard falen, zodat de veiligheidsklep niet breder is dan nodig.
describe("getActiveVariant", () => {
  it("geeft de opgehaalde variant terug wanneer die gevonden wordt", async () => {
    mockHeaders.mockResolvedValue(maakHeaders("mijnmonti"));
    mockIsProduction.mockReturnValue(true);
    const gevonden = { ...defaultVariant, slug: "mijnmonti", name: "MijnMonti" };
    mockGetVariantBySlug.mockResolvedValue(gevonden);

    const result = await getActiveVariant();
    expect(result).toBe(gevonden);
  });

  it("valt in productie terug op defaultVariant wanneer de standaardvariant niet gevonden wordt", async () => {
    mockHeaders.mockResolvedValue(maakHeaders(defaultVariant.slug));
    mockIsProduction.mockReturnValue(true);
    mockGetVariantBySlug.mockResolvedValue(null);

    const result = await getActiveVariant();
    expect(result).toBe(defaultVariant);
  });

  it("valt in productie terug op defaultVariant wanneer de opzoeking van de standaardvariant faalt", async () => {
    mockHeaders.mockResolvedValue(maakHeaders(defaultVariant.slug));
    mockIsProduction.mockReturnValue(true);
    mockGetVariantBySlug.mockRejectedValue(new Error("DB onbereikbaar"));

    const result = await getActiveVariant();
    expect(result).toBe(defaultVariant);
  });

  it("gooit in productie WEL een fout voor een andere (niet-standaard) variant die niet gevonden wordt", async () => {
    mockHeaders.mockResolvedValue(maakHeaders("mijnmonti"));
    mockIsProduction.mockReturnValue(true);
    mockGetVariantBySlug.mockResolvedValue(null);

    await expect(getActiveVariant()).rejects.toThrow();
  });

  it("gooit in productie WEL een fout wanneer de opzoeking van een andere variant faalt", async () => {
    mockHeaders.mockResolvedValue(maakHeaders("mijnmonti"));
    mockIsProduction.mockReturnValue(true);
    mockGetVariantBySlug.mockRejectedValue(new Error("DB onbereikbaar"));

    await expect(getActiveVariant()).rejects.toThrow("DB onbereikbaar");
  });

  it("valt in development terug op defaultVariant voor elke variant die niet gevonden wordt", async () => {
    mockHeaders.mockResolvedValue(maakHeaders("mijnmonti"));
    mockIsProduction.mockReturnValue(false);
    mockGetVariantBySlug.mockResolvedValue(null);

    const result = await getActiveVariant();
    expect(result).toBe(defaultVariant);
  });
});
