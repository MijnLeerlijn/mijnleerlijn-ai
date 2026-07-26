import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MarkdownAnswer from "./MarkdownAnswer";

// Livegang-afwerking (Helpdesk MVP 1.0): AI-antwoorden bevatten soms
// letterlijke markdown-syntax (**vet**, ### koppen, genummerde stappen) —
// dit component moet die daadwerkelijk als opmaak renderen, EN mag nooit
// ruwe HTML uit de brontekst uitvoeren (het antwoord komt van een
// taalmodel, dus dit is in principe onvertrouwde input).
describe("MarkdownAnswer", () => {
  it("rendert een koptekst als <h3>, niet als letterlijke '#'-tekens", () => {
    render(<MarkdownAnswer tekst="### Stap 1: open het menu" />);
    expect(screen.getByRole("heading", { level: 3, name: "Stap 1: open het menu" })).toBeInTheDocument();
    expect(screen.queryByText(/###/)).not.toBeInTheDocument();
  });

  it("rendert vetgedrukte tekst als <strong>, niet als letterlijke '**'-tekens", () => {
    render(<MarkdownAnswer tekst="Klik op **Opslaan** om door te gaan." />);
    const strong = screen.getByText("Opslaan");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("rendert een genummerde lijst als <ol>/<li>", () => {
    render(<MarkdownAnswer tekst={"1. Open het menu\n2. Kies Instellingen\n3. Klik op Opslaan"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Open het menu");
  });

  it("rendert een opsomming als <ul>/<li>", () => {
    render(<MarkdownAnswer tekst={"- Eerste punt\n- Tweede punt"} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("rendert een link als klikbaar <a>-element dat in een nieuw tabblad opent", () => {
    render(<MarkdownAnswer tekst="Zie de [handleiding](https://mijnleerlijn.nl/help) voor meer info." />);
    const link = screen.getByRole("link", { name: "handleiding" });
    expect(link).toHaveAttribute("href", "https://mijnleerlijn.nl/help");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("voert GEEN ruwe HTML in de brontekst uit (bv. een img-tag met onerror) — toont het als platte tekst, niet als element", () => {
    const kwaadaardig = 'Kijk hier: <img src=x onerror="window.__xss = true">';
    render(<MarkdownAnswer tekst={kwaadaardig} />);

    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  });

  it("voert geen script-tag uit die in het antwoord zou staan", () => {
    render(<MarkdownAnswer tekst='<script>window.__xss2 = true</script>Gewone tekst.' />);

    expect(document.querySelector("script[data-injected]")).not.toBeInTheDocument();
    expect((window as unknown as { __xss2?: boolean }).__xss2).toBeUndefined();
    expect(screen.getByText(/Gewone tekst/)).toBeInTheDocument();
  });
});
