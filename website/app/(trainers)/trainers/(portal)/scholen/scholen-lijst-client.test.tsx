import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScholenLijstClient from "./scholen-lijst-client";
import type { TrainerSchoolSamenvatting } from "@/lib/trainers/monday-links";

// Traineromgeving V1, Ronde 2 vervolg (2026-08-19) — dekt de zoekbalk op
// "Mijn scholen" (opdrachtseis: zoekbalk behouden, geen Monday-aanroep per
// toetsaanslag, alfabetische sortering blijft ongewijzigd — die sortering
// zelf komt uit bepaalScholenVoorTrainer, al gedekt in
// monday-links.test.ts; dit bestand test uitsluitend het in-memory filteren
// van ScholenLijstClient zelf). Gebruikt bewust geen fetch-/router-mock: dit
// component doet geen netwerkverkeer en roept useRouter() niet aan.
function school(opts: { id: string; naam: string }): TrainerSchoolSamenvatting {
  return {
    id: opts.id,
    naam: opts.naam,
    onderwijstype: "Montessori",
    locatie: "Gorinchem",
    implementatiefase: null,
    contactpersoonNaam: null,
    contactpersoonBetrouwbaar: false,
    bron: "trainer-relatie",
    aantalOpen: 0,
    aantalGepland: 0,
    aantalGedaan: 0,
    eerstvolgendeTraining: null,
  };
}

// Bewust al alfabetisch (A-Z) aangeleverd, zoals bepaalScholenVoorTrainer
// (monday-links.ts) altijd doet — deze component sorteert zelf niet, filtert
// alleen, dus de test hieronder bevestigt dat filteren die volgorde niet
// verstoort.
const SCHOLEN: TrainerSchoolSamenvatting[] = [
  school({ id: "1", naam: "Basisschool De Boomgaard" }),
  school({ id: "2", naam: "CBS de Wereld" }),
  school({ id: "3", naam: "Montessori Gorinchem" }),
  school({ id: "4", naam: "Montessori Vianen" }),
];

describe("ScholenLijstClient — zoekbalk", () => {
  it("toont alle scholen in de aangeleverde (alfabetische) volgorde zonder zoekterm", () => {
    render(<ScholenLijstClient scholen={SCHOLEN} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Basisschool De Boomgaard"),
      expect.stringContaining("CBS de Wereld"),
      expect.stringContaining("Montessori Gorinchem"),
      expect.stringContaining("Montessori Vianen"),
    ]);
  });

  it("filtert case-insensitief op schoolnaam-substring, volgorde blijft behouden", async () => {
    const user = userEvent.setup();
    render(<ScholenLijstClient scholen={SCHOLEN} />);

    await user.type(screen.getByLabelText("Zoek op schoolnaam"), "montessori");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("Montessori Gorinchem");
    expect(links[1]).toHaveTextContent("Montessori Vianen");
    expect(screen.queryByText(/CBS de Wereld/)).not.toBeInTheDocument();
  });

  it("toont een lege staat met de getypte zoekterm wanneer niets matcht", async () => {
    const user = userEvent.setup();
    render(<ScholenLijstClient scholen={SCHOLEN} />);

    await user.type(screen.getByLabelText("Zoek op schoolnaam"), "xyz-onbestaand");

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/Geen scholen gevonden voor.*xyz-onbestaand/)).toBeInTheDocument();
  });

  it("legen van het zoekveld herstelt de volledige lijst", async () => {
    const user = userEvent.setup();
    render(<ScholenLijstClient scholen={SCHOLEN} />);

    const input = screen.getByLabelText("Zoek op schoolnaam");
    await user.type(input, "wereld");
    expect(screen.getAllByRole("link")).toHaveLength(1);

    await user.clear(input);
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });
});
