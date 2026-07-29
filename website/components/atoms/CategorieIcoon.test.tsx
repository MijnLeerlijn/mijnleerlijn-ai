import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import CategorieIcoon from "./CategorieIcoon";
import type { CategorieKleur } from "@/lib/data/categories";

// Categorie-uiterlijk (2026-07-29): CategorieIcoon rendert nu via
// lucide-react's `DynamicIcon` (lazy, async) i.p.v. een statisch
// geïmporteerde iconenkaart — vandaar `waitFor` op het aanwezig zijn van een
// <svg> in de tests hieronder.
describe("CategorieIcoon", () => {
  it("rendert het icoon voor een geldige kebab-case naam", async () => {
    const { container } = render(<CategorieIcoon naam="rocket" kleur="blue" />);
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
  });

  it("normaliseert een legacy PascalCase-naam (bv. 'StickyNote') en rendert het icoon", async () => {
    const { container } = render(<CategorieIcoon naam="StickyNote" kleur="yellow" />);
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
  });

  it("valt terug op het standaardicoon bij een onbekende iconnaam, zonder te crashen", async () => {
    const { container } = render(<CategorieIcoon naam="dit-bestaat-niet-123" kleur="blue" />);
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
  });

  it("valt terug op het standaardicoon bij een lege iconnaam", async () => {
    const { container } = render(<CategorieIcoon naam="" kleur="blue" />);
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
  });

  const alleKleuren: CategorieKleur[] = [
    "blue",
    "green",
    "red",
    "orange",
    "yellow",
    "purple",
    "teal",
    "pink",
    "slate",
  ];

  it.each(alleKleuren)("rendert zonder fout voor kleur '%s'", async (kleur) => {
    const { container } = render(<CategorieIcoon naam="target" kleur={kleur} />);
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
  });

  it("valt terug op blauw bij een onbekende/ongeldige kleurwaarde", () => {
    const { container } = render(<CategorieIcoon naam="target" kleur={"onbekend" as CategorieKleur} />);
    expect(container.firstElementChild).toHaveClass("bg-blauw/8");
  });
});
