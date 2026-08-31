import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TrainingSamenvatting, TrainingStatus } from "@/lib/trainers/monday-links";
import type { TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import { TrainingSecties } from "./training-secties";

// Zelfde reden als training-rij.test.tsx — TrainingRij (gerenderd binnen elke
// sectie) roept useRouter() rechtstreeks aan.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

function training(overrides: Partial<TrainingSamenvatting> & { id: string; naam: string }): TrainingSamenvatting {
  return {
    status: "open" as TrainingStatus,
    ruweStatusTekst: null,
    datum: null,
    logboekIngevuld: false,
    trainerboardItemId: null, // niet-bewerkbaar -> geen popovers/router-interactie nodig in deze presentatietests
    bron: "mijnleerlijn",
    ...overrides,
  };
}

function legeSecties(): Record<TrainingWeergaveStatus, TrainingSamenvatting[]> {
  return { verslag_nog_invullen: [], vandaag: [], komend: [], open: [], gedaan: [], geannuleerd: [] };
}

const LEGE_VERSLAGEN = new Map();

describe("TrainingSecties — schoolddetail-UX-ronde (secties/volgorde/aantallen)", () => {
  it("toont uitsluitend secties die daadwerkelijk trainingen bevatten", () => {
    // status: "gedaan" op de fixture zelf — anders toont de (niet-bewerkbare)
    // statusbadge de tekst "Nieuw" (default-status), wat toevallig botst met
    // de assertie hieronder dat de "Nieuw"-SECTIE niet bestaat. Twee losse
    // concepten (sectienaam vs. statusbadge-tekst) die hier bewust
    // uiteengehouden worden.
    const trainingen = { ...legeSecties(), gedaan: [training({ id: "1", naam: "Training A", status: "gedaan" })] };
    render(<TrainingSecties trainingen={trainingen} schoolId="500" verslagenPerTraining={LEGE_VERSLAGEN} />);

    expect(screen.getByText("Gedaan (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Verslag nog invullen/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Vandaag/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Gepland/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Nieuw/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Geannuleerd/)).not.toBeInTheDocument();
  });

  it("toont de juiste, actiegerichte sectievolgorde: Verslag nog invullen -> Vandaag -> Gepland -> Nieuw -> Gedaan -> Geannuleerd", () => {
    const trainingen: Record<TrainingWeergaveStatus, TrainingSamenvatting[]> = {
      geannuleerd: [training({ id: "6", naam: "Geannuleerde training" })],
      gedaan: [training({ id: "5", naam: "Afgeronde training" })],
      open: [training({ id: "4", naam: "Nieuwe training" })],
      komend: [training({ id: "3", naam: "Geplande training" })],
      vandaag: [training({ id: "2", naam: "Training van vandaag" })],
      verslag_nog_invullen: [training({ id: "1", naam: "Training zonder verslag" })],
    };
    render(<TrainingSecties trainingen={trainingen} schoolId="500" verslagenPerTraining={LEGE_VERSLAGEN} />);

    const koppen = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    expect(koppen).toEqual([
      "Verslag nog invullen (1)",
      "Vandaag (1)",
      "Gepland (1)",
      "Nieuw (1)",
      "Gedaan (1)",
      "Geannuleerd (1)",
    ]);
  });

  it("de 'komend'-bucket heet in de UI 'Gepland', niet 'Komend' (opdrachtseis)", () => {
    const trainingen = { ...legeSecties(), komend: [training({ id: "1", naam: "Training" })] };
    render(<TrainingSecties trainingen={trainingen} schoolId="500" verslagenPerTraining={LEGE_VERSLAGEN} />);
    expect(screen.getByText("Gepland (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Komend/)).not.toBeInTheDocument();
  });

  it("toont het aantal trainingen per sectie, ook bij meer dan 1", () => {
    const trainingen = {
      ...legeSecties(),
      verslag_nog_invullen: [training({ id: "1", naam: "A" }), training({ id: "2", naam: "B" })],
    };
    render(<TrainingSecties trainingen={trainingen} schoolId="500" verslagenPerTraining={LEGE_VERSLAGEN} />);
    expect(screen.getByText("Verslag nog invullen (2)")).toBeInTheDocument();
  });

  it("behoudt binnen een sectie exact de aangeleverde (alfabetische) volgorde — deze component sorteert zelf niets", () => {
    const trainingen = {
      ...legeSecties(),
      open: [training({ id: "1", naam: "Aardrijkskunde" }), training({ id: "2", naam: "Biologie" }), training({ id: "3", naam: "Chemie" })],
    };
    render(<TrainingSecties trainingen={trainingen} schoolId="500" verslagenPerTraining={LEGE_VERSLAGEN} />);
    const namen = screen.getAllByText(/Aardrijkskunde|Biologie|Chemie/).map((el) => el.textContent);
    expect(namen).toEqual(["Aardrijkskunde", "Biologie", "Chemie"]);
  });

  it("toont een rustige lege toestand wanneer geen enkele sectie trainingen bevat — geen sectiekoppen, geen foutachtige styling", () => {
    render(<TrainingSecties trainingen={legeSecties()} schoolId="500" verslagenPerTraining={LEGE_VERSLAGEN} />);
    expect(screen.getByText("Geen trainingen bekend voor deze school.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("de sectiekop is een prominente, herkenbare kop (heading-element), geen kleine losse tekstregel", () => {
    const trainingen = { ...legeSecties(), gedaan: [training({ id: "1", naam: "Training" })] };
    render(<TrainingSecties trainingen={trainingen} schoolId="500" verslagenPerTraining={LEGE_VERSLAGEN} />);
    const kop = screen.getByRole("heading", { level: 3, name: "Gedaan (1)" });
    expect(kop).toHaveClass("font-semibold");
  });
});
