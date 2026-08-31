import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrainingMetSchool } from "@/lib/trainers/monday-links";
import type { TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import { TrainingenSecties, type TrainingenSectie } from "./trainingen-secties";

// Vervolgronde (2026-08-22) — inklapbare sectiekoppen op /trainingen. Dit
// component roept, i.t.t. de school-detailpagina se training-secties.tsx,
// GEEN useRouter() aan — de lokale TrainingRij hier is een kale <Link>, geen
// bewerkbare rij — dus is hier geen next/navigation-mock nodig (vergelijk
// training-secties.test.tsx, dat die mock wél heeft).

function training(overrides: Partial<TrainingMetSchool> & { id: string; naam: string }): TrainingMetSchool {
  return {
    status: "open",
    ruweStatusTekst: null,
    datum: null,
    logboekIngevuld: false,
    trainerboardItemId: null,
    bron: "mijnleerlijn",
    schoolId: "500",
    schoolNaam: "School A",
    ...overrides,
  };
}

function sectie(status: TrainingWeergaveStatus, titel: string, trainingen: TrainingMetSchool[]): TrainingenSectie {
  return { status, titel, trainingen };
}

describe("TrainingenSecties — inklapbare sectiekoppen (Vervolgronde 2026-08-22)", () => {
  it("een klik op de sectiekop klapt een dichte sectie open, een tweede klik weer dicht", async () => {
    const user = userEvent.setup();
    render(<TrainingenSecties secties={[sectie("gedaan", "Gedaan", [training({ id: "1", naam: "Training A" })])]} />);

    // "gedaan" staat standaard dicht.
    expect(screen.queryByText("Training A")).not.toBeInTheDocument();

    const kop = screen.getByRole("button", { name: /Gedaan \(1\)/ });
    await user.click(kop);
    expect(screen.getByText("Training A")).toBeInTheDocument();

    await user.click(kop);
    expect(screen.queryByText("Training A")).not.toBeInTheDocument();
  });

  it("aria-expanded weerspiegelt correct de open/dicht-toestand", async () => {
    const user = userEvent.setup();
    render(<TrainingenSecties secties={[sectie("open", "Nog niet gepland", [training({ id: "1", naam: "Training A" })])]} />);

    const kop = screen.getByRole("button", { name: /Nog niet gepland/ });
    expect(kop).toHaveAttribute("aria-expanded", "false");

    await user.click(kop);
    expect(kop).toHaveAttribute("aria-expanded", "true");
  });

  it("is bedienbaar met het toetsenbord — Enter op de gefocuste kop opent de sectie", async () => {
    const user = userEvent.setup();
    render(<TrainingenSecties secties={[sectie("gedaan", "Gedaan", [training({ id: "1", naam: "Training A" })])]} />);

    const kop = screen.getByRole("button", { name: /Gedaan/ });
    kop.focus();
    expect(kop).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByText("Training A")).toBeInTheDocument();
  });

  it("de teller in de kop blijft zichtbaar, ook als de sectie dicht staat", () => {
    render(<TrainingenSecties secties={[sectie("open", "Nog niet gepland", [training({ id: "1", naam: "A" }), training({ id: "2", naam: "B" })])]} />);
    expect(screen.getByRole("button", { name: /Nog niet gepland \(2\)/ })).toBeInTheDocument();
  });

  it("standaard open: 'Verslag nog invullen', 'Vandaag' en 'Komend'", () => {
    render(
      <TrainingenSecties
        secties={[
          sectie("verslag_nog_invullen", "Verslag nog invullen", [training({ id: "1", naam: "A" })]),
          sectie("vandaag", "Vandaag", [training({ id: "2", naam: "B" })]),
          sectie("komend", "Komend", [training({ id: "3", naam: "C" })]),
        ]}
      />
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("standaard dicht: 'Nog niet gepland', 'Gedaan' en 'Geannuleerd' (rustigere pagina)", () => {
    render(
      <TrainingenSecties
        secties={[
          sectie("open", "Nog niet gepland", [training({ id: "1", naam: "A" })]),
          sectie("gedaan", "Gedaan", [training({ id: "2", naam: "B" })]),
          sectie("geannuleerd", "Geannuleerd", [training({ id: "3", naam: "C" })]),
        ]}
      />
    );
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
    expect(screen.queryByText("C")).not.toBeInTheDocument();
  });

  it("secties zijn onafhankelijk — het open-klappen van de één laat de ander ongemoeid", async () => {
    const user = userEvent.setup();
    render(
      <TrainingenSecties
        secties={[
          sectie("vandaag", "Vandaag", [training({ id: "1", naam: "Vandaag-training" })]),
          sectie("gedaan", "Gedaan", [training({ id: "2", naam: "Gedaan-training" })]),
        ]}
      />
    );
    expect(screen.getByText("Vandaag-training")).toBeInTheDocument();
    expect(screen.queryByText("Gedaan-training")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Gedaan/ }));

    expect(screen.getByText("Vandaag-training")).toBeInTheDocument();
    expect(screen.getByText("Gedaan-training")).toBeInTheDocument();
  });
});
