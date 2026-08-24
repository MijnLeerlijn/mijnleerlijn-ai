import { describe, it, expect, vi } from "vitest";
import { generateMetadata } from "./page";
import { getActiveVariant } from "@/lib/variant/get-active-variant";
import { defaultVariant } from "@/config/variants";

vi.mock("@/lib/variant/get-active-variant", () => ({ getActiveVariant: vi.fn() }));

const mockGetActiveVariant = vi.mocked(getActiveVariant);

// Chat delen via URL (2026-08-24, spec §A8: "mogen niet in Google terecht-
// komen") — de publieke gedeelde-chatpagina moet altijd noindex/nofollow
// meegeven, ongeacht welke variant actief is. Test uitsluitend generate-
// Metadata() (een gewone async functie, geen rendering nodig) — de rest van
// de pagina (snapshot-weergave/"niet meer beschikbaar") wordt al gedekt door
// lib/helpdesk/delen.test.ts (de databronfunctie) en de bestaande, hergebruikte
// MarkdownAnswer-tests (opmaak/XSS-veiligheid).
describe("generateMetadata — /delen/[token]", () => {
  it("bevat altijd robots: noindex/nofollow", async () => {
    mockGetActiveVariant.mockResolvedValue(defaultVariant);
    const metadata = await generateMetadata({ params: Promise.resolve({ token: "een-token" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("neemt de productnaam van de actieve variant op in de titel", async () => {
    mockGetActiveVariant.mockResolvedValue({ ...defaultVariant, branding: { ...defaultVariant.branding, productName: "MijnMonti" } });
    const metadata = await generateMetadata({ params: Promise.resolve({ token: "een-token" }) });
    expect(metadata.title).toBe("Gedeeld gesprek — MijnMonti Helpdesk");
  });
});
