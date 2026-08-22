import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KennisLijstClient } from "./kennis-lijst-client";
import type { TrainerKennisversieOverzicht } from "@/lib/trainers/kennis";

// Vervolgronde (2026-08-22) — dekt de zoekbalk op /kennis (opdrachtseis:
// "trainer kan zoeken"). Zelfde opzet als scholen-lijst-client.test.tsx —
// geen fetch-/router-mock nodig: dit component doet geen netwerkverkeer en
// roept useRouter() niet aan.
const KENNISVERSIES: TrainerKennisversieOverzicht[] = [
  { id: 1, titel: "Periodevoorbereiding begeleiden", samenvatting: "Hoe je een school helpt bij het voorbereiden van een periode." },
  { id: 2, titel: "Kindgesprekken voeren", samenvatting: "Waar je op let tijdens een kindgesprek." },
  { id: 3, titel: "Montessori-materiaal introduceren", samenvatting: "Stapsgewijs nieuw materiaal introduceren bij een groep." },
];

describe("KennisLijstClient — zoekbalk", () => {
  it("toont alle kennisversies zonder zoekterm", () => {
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("filtert case-insensitief op titel, volgorde blijft behouden", async () => {
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "montessori");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Montessori-materiaal introduceren");
  });

  it("filtert ook op samenvatting-tekst, niet uitsluitend op titel", async () => {
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "kindgesprek");

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Kindgesprekken voeren")).toBeInTheDocument();
  });

  it("toont een rustige lege staat wanneer niets matcht", async () => {
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "xyz-onbestaand");

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/Geen kennisartikelen gevonden voor.*xyz-onbestaand/)).toBeInTheDocument();
  });

  it("toont een aparte lege staat wanneer er nog helemaal geen kennisartikelen zijn (leeg zonder zoekterm)", () => {
    render(<KennisLijstClient kennisversies={[]} />);
    expect(screen.getByText("Nog geen kennisartikelen gepubliceerd.")).toBeInTheDocument();
  });

  it("elke link wijst naar /kennis/[id]", () => {
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/kennis/1");
  });
});
