import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KennisReader } from "./kennis-reader";

// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
// (opdrachtseis §1/§6/§10): dekt de inhoudsopgave (desktop + mobiel) en de
// kortstondige markering bij binnenkomst via een hoofdstuk-hash-link.
// jsdom kent geen IntersectionObserver — een minimale nep-implementatie
// hieronder is voldoende: de actief-hoofdstuk-tracking zelf (opdrachtseis
// §1, "tijdens scrollen") is scroll-/layoutgedrag dat hier niet zinvol na te
// bootsen is en is met de Playwright-screenshots handmatig geverifieerd; wat
// hier telt is dat het component niet crasht zonder een echte browser-API.
class NepIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
  root = null;
  rootMargin = "";
  thresholds: number[] = [];
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}

const MARKDOWN = ["## 1. Wat is MijnLeerlijn?", "Inleidende tekst.", "", "## 2. De DOEL-aanpak", "Tekst over de aanpak."].join("\n");

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NepIntersectionObserver);
  window.location.hash = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("KennisReader — desktop inhoudsopgave", () => {
  it("toont de paginatitel als enige h1", () => {
    render(<KennisReader titel="Basiskennis" tekst={MARKDOWN} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Basiskennis");
  });

  it("toont elk hoofdstuk als link in de inhoudsopgave, met correcte hash-hrefs", () => {
    render(<KennisReader titel="Basiskennis" tekst={MARKDOWN} />);
    const toc = screen.getByRole("navigation", { name: "Inhoudsopgave" });
    expect(toc).toHaveTextContent("1. Wat is MijnLeerlijn?");
    expect(toc).toHaveTextContent("2. De DOEL-aanpak");
    const links = screen.getAllByRole("link", { name: /Wat is MijnLeerlijn|DOEL-aanpak/ });
    expect(links.some((l) => l.getAttribute("href") === "#1-wat-is-mijnleerlijn")).toBe(true);
    expect(links.some((l) => l.getAttribute("href") === "#2-de-doel-aanpak")).toBe(true);
  });

  it("een document zonder Markdown-headings toont geen inhoudsopgave en geen 'Inhoud'-knop", () => {
    render(<KennisReader titel="Kort artikel" tekst="Gewone tekst zonder koppen." />);
    expect(screen.queryByRole("navigation", { name: "Inhoudsopgave" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inhoud/ })).not.toBeInTheDocument();
  });
});

describe("KennisReader — mobiele inhoudsopgave", () => {
  it("toont een 'Inhoud'-knop die het mobiele menu opent met dezelfde hoofdstukken", async () => {
    const user = userEvent.setup();
    render(<KennisReader titel="Basiskennis" tekst={MARKDOWN} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Inhoud/ }));

    const dialoog = screen.getByRole("dialog", { name: "Inhoudsopgave" });
    expect(dialoog).toHaveTextContent("1. Wat is MijnLeerlijn?");
    expect(dialoog).toHaveTextContent("2. De DOEL-aanpak");
  });

  it("sluit het mobiele menu met Escape en geeft focus terug aan de 'Inhoud'-knop", async () => {
    const user = userEvent.setup();
    render(<KennisReader titel="Basiskennis" tekst={MARKDOWN} />);

    const inhoudKnop = screen.getByRole("button", { name: /Inhoud/ });
    await user.click(inhoudKnop);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(inhoudKnop).toHaveFocus();
  });

  it("een klik op een hoofdstuk in het mobiele menu sluit het menu", async () => {
    const user = userEvent.setup();
    render(<KennisReader titel="Basiskennis" tekst={MARKDOWN} />);

    await user.click(screen.getByRole("button", { name: /Inhoud/ }));
    const dialoog = screen.getByRole("dialog");
    const link = within(dialoog).getByRole("link", { name: /Wat is MijnLeerlijn/ });
    expect(link).toHaveAttribute("href", "#1-wat-is-mijnleerlijn");

    await user.click(link);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("focus gaat bij openen naar het eerste hoofdstuk in het menu", async () => {
    const user = userEvent.setup();
    render(<KennisReader titel="Basiskennis" tekst={MARKDOWN} />);

    await user.click(screen.getByRole("button", { name: /Inhoud/ }));

    await waitFor(() => {
      const dialoog = screen.getByRole("dialog");
      const eersteLink = within(dialoog).getAllByRole("link")[0];
      expect(eersteLink).toHaveFocus();
    });
  });
});

describe("KennisReader — deep-link markering (opdrachtseis §6)", () => {
  it("markeert het aangesproken hoofdstuk kort en verwijdert de markering na een paar seconden", async () => {
    vi.useFakeTimers();
    window.location.hash = "#2-de-doel-aanpak";

    render(<KennisReader titel="Basiskennis" tekst={MARKDOWN} />);

    const heading = screen.getByRole("heading", { name: "2. De DOEL-aanpak" });
    expect(heading).toHaveClass("bg-teal-100");

    await vi.advanceTimersByTimeAsync(3000);

    expect(heading).not.toHaveClass("bg-teal-100");
  });

  it("zonder hash in de URL wordt niets gemarkeerd", () => {
    window.location.hash = "";
    render(<KennisReader titel="Basiskennis" tekst={MARKDOWN} />);
    const heading = screen.getByRole("heading", { name: "1. Wat is MijnLeerlijn?" });
    expect(heading).not.toHaveClass("bg-teal-100");
  });

  it("een hash die niet bij een bestaand hoofdstuk hoort, laat de pagina gewoon met rust (geen crash)", () => {
    window.location.hash = "#bestaat-niet";
    expect(() => render(<KennisReader titel="Basiskennis" tekst={MARKDOWN} />)).not.toThrow();
  });
});
