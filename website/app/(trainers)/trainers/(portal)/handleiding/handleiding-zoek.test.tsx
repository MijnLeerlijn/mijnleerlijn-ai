import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HandleidingZoek } from "./handleiding-zoek";
import type { MarkdownHeading } from "@/lib/content/markdown-headings";

// Handleidingronde (2026-08-25) — dekt de nieuwe zoekfunctie (opdrachtseis:
// "eenvoudige zoekfunctie... zoekresultaten moeten naar het relevante
// hoofdstuk/tussenkopje springen"). Zelfde opzet als kennis-lijst-
// client.test.tsx — geen fetch-/router-mock nodig, puur synchrone
// in-memory filtering. Headings hier bewust handmatig samengesteld (i.p.v.
// haalHeadingsOp op de echte handleidingtekst) — dit test de
// zoekcomponent zelf, los van de inhoud (die dekt lib/trainers/
// handleiding.test.ts apart).
const HEADINGS: MarkdownHeading[] = [
  { level: 1, text: "Welkom in de traineromgeving", slug: "welkom-in-de-traineromgeving" },
  { level: 1, text: "Werken met scholen", slug: "werken-met-scholen" },
  { level: 2, text: "Mijn scholen", slug: "mijn-scholen" },
  { level: 2, text: "Het schooldossier", slug: "het-schooldossier" },
  { level: 1, text: "Een verslag maken en afronden", slug: "een-verslag-maken-en-afronden" },
  { level: 2, text: "Wachtwoord wijzigen", slug: "wachtwoord-wijzigen" },
];

describe("HandleidingZoek", () => {
  it("toont geen resultaten zonder zoekterm", () => {
    render(<HandleidingZoek headings={HEADINGS} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("filtert case-insensitief op koptekst en springt via een anker-link naar de juiste slug", async () => {
    const user = userEvent.setup();
    render(<HandleidingZoek headings={HEADINGS} />);

    await user.type(screen.getByLabelText("Zoek in de handleiding"), "schooldossier");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "#het-schooldossier");
    expect(links[0]).toHaveTextContent("Het schooldossier");
  });

  it("toont het bijbehorende hoofdstuk als context bij een tussenkopje-resultaat, niet bij een hoofdstuk zelf", async () => {
    const user = userEvent.setup();
    render(<HandleidingZoek headings={HEADINGS} />);

    await user.type(screen.getByLabelText("Zoek in de handleiding"), "mijn scholen");

    const link = screen.getByRole("link", { name: /Mijn scholen/ });
    expect(link).toHaveTextContent("Werken met scholen");
  });

  it("matcht een hoofdstuktitel zelf ook (bv. exact het voorbeeld uit de opdracht)", async () => {
    const user = userEvent.setup();
    render(<HandleidingZoek headings={HEADINGS} />);

    await user.type(screen.getByLabelText("Zoek in de handleiding"), "verslag maken");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "#een-verslag-maken-en-afronden");
  });

  it("toont een duidelijke melding zonder resultaten, geen lege lijst", async () => {
    const user = userEvent.setup();
    render(<HandleidingZoek headings={HEADINGS} />);

    await user.type(screen.getByLabelText("Zoek in de handleiding"), "xyznietbestaand");

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/Geen resultaten voor/)).toBeInTheDocument();
  });

  it("wist de zoekterm (en daarmee de resultaten) bij het klikken op een resultaat", async () => {
    const user = userEvent.setup();
    render(<HandleidingZoek headings={HEADINGS} />);

    const input = screen.getByLabelText("Zoek in de handleiding");
    await user.type(input, "wachtwoord");
    expect(screen.getAllByRole("link")).toHaveLength(1);

    await user.click(screen.getByRole("link", { name: /Wachtwoord wijzigen/ }));
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(input).toHaveValue("");
  });

  it("wist de zoekterm met de wis-knop", async () => {
    const user = userEvent.setup();
    render(<HandleidingZoek headings={HEADINGS} />);

    const input = screen.getByLabelText("Zoek in de handleiding");
    await user.type(input, "welkom");
    expect(screen.getAllByRole("link")).toHaveLength(1);

    await user.click(screen.getByLabelText("Zoekterm wissen"));
    expect(input).toHaveValue("");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
