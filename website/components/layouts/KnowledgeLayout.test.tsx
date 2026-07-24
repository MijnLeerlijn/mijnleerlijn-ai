import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import KnowledgeLayout from "./KnowledgeLayout";
import PublicLayout from "./PublicLayout";

// Regressietest voor dubbele Header/Footer op pagina's die KnowledgeLayout
// gebruiken (artikel, categorie, updates, contact, kies-variant): al deze
// pagina's zitten onder app/(frontend)/(public)/layout.tsx, dat zelf al
// PublicLayout (Header/Footer) rendert. KnowledgeLayout wrapte tot voor kort
// zíjn children OOK nog eens in PublicLayout — met de echte route-groep-
// nesting (hieronder gesimuleerd door PublicLayout > KnowledgeLayout, zoals
// in de app) verscheen Header/Footer daardoor twee keer.
//
// Header/Footer zelf worden hier niet echt gerenderd (Header gebruikt
// next/navigation's useRouter, dat buiten een echte Next-navigatiecontext
// niet werkt) — de mocks staan voor "iets met de header/footer-rol", zodat
// dit puur de NESTING-structuur test, niet Header/Footer's eigen gedrag
// (dat hoort bij hun eigen tests).
vi.mock("@/components/organisms/Header", () => ({
  default: () => <header>Kop</header>,
}));
vi.mock("@/components/organisms/Footer", () => ({
  default: () => <footer>Voet</footer>,
}));

describe("KnowledgeLayout — geen dubbele Header/Footer", () => {
  it("rendert zelf geen Header/Footer — dat is de taak van de route-groep-layout (PublicLayout)", () => {
    render(
      <KnowledgeLayout breadcrumb={[{ label: "Home", href: "/" }]}>
        <p>Artikelinhoud</p>
      </KnowledgeLayout>
    );

    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByText("Artikelinhoud")).toBeInTheDocument();
  });

  it("toont precies één Header en één Footer wanneer genest zoals in de echte app (PublicLayout > pagina > KnowledgeLayout)", () => {
    render(
      <PublicLayout>
        <KnowledgeLayout breadcrumb={[{ label: "Home", href: "/" }]}>
          <p>Artikelinhoud</p>
        </KnowledgeLayout>
      </PublicLayout>
    );

    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
  });

  it("toont de sidebar in zowel de mobiele als de desktopweergave, zonder de layout te dupliceren", () => {
    render(
      <KnowledgeLayout breadcrumb={[{ label: "Home", href: "/" }]} sidebar={<span>Inhoudsopgave</span>}>
        <p>Artikelinhoud</p>
      </KnowledgeLayout>
    );

    expect(screen.getAllByText("Inhoudsopgave")).toHaveLength(2);
  });
});
