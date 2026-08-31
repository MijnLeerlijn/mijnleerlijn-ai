import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AanvullendeTrainingenPaneel, type AanvullendeTrainingRegel } from "./aanvullende-trainingen-paneel";

// Productiecheck-bugfix (2026-08-31, bug 1) — dekt de nieuwe "Bewerken"-UI
// (naam/datum wijzigen na aanmaken). Zelfde fetch-mockpatroon als
// training-rij.test.tsx.
function mockFetchEenmaal(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const TRAINING: AanvullendeTrainingRegel = { id: 1, naam: "Coachgesprek rekenen", datum: "2026-09-10", trainerNaam: "Wessel Kok" };

describe("AanvullendeTrainingenPaneel — bewerken", () => {
  it("toont naam/datum vooraf ingevuld zodra 'Bewerken' wordt geklikt", async () => {
    const user = userEvent.setup();
    render(<AanvullendeTrainingenPaneel schoolId="500" initieel={[TRAINING]} />);

    await user.click(screen.getByRole("button", { name: "Bewerken" }));

    expect(screen.getByLabelText("Training")).toHaveValue("Coachgesprek rekenen");
    expect(screen.getByLabelText("Datum")).toHaveValue("2026-09-10");
  });

  it("stuurt een PATCH naar de juiste URL met de gewijzigde naam/datum, en werkt de lijst bij zonder herlaad", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchEenmaal(200, { training: { id: 1, naam: "Coachgesprek taal", datum: "2026-09-17", mondaySchoolId: "500", schoolNaam: "Montessori Gorinchem" } });
    render(<AanvullendeTrainingenPaneel schoolId="500" initieel={[TRAINING]} />);

    await user.click(screen.getByRole("button", { name: "Bewerken" }));
    const naamVeld = screen.getByLabelText("Training");
    await user.clear(naamVeld);
    await user.type(naamVeld, "Coachgesprek taal");
    const datumVeld = screen.getByLabelText("Datum");
    await user.clear(datumVeld);
    await user.type(datumVeld, "2026-09-17");
    await user.click(screen.getByRole("button", { name: "Opslaan" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trainers/scholen/500/aanvullende-trainingen/1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ naam: "Coachgesprek taal", datum: "2026-09-17" }) })
    );
    expect(await screen.findByText("Coachgesprek taal")).toBeInTheDocument();
    // Het bewerkformulier is weer dicht — terug naar de normale rijweergave met "Verslag"-link.
    expect(screen.queryByLabelText("Training")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verslag" })).toHaveAttribute("href", "/scholen/500/trainingen/aanvullend:1/verslag");
  });

  it("toont de serverfoutmelding en laat het formulier openstaan bij een mislukte wijziging", async () => {
    const user = userEvent.setup();
    mockFetchEenmaal(404, { error: "Training niet gevonden." });
    render(<AanvullendeTrainingenPaneel schoolId="500" initieel={[TRAINING]} />);

    await user.click(screen.getByRole("button", { name: "Bewerken" }));
    await user.click(screen.getByRole("button", { name: "Opslaan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Training niet gevonden.");
    expect(screen.getByLabelText("Training")).toBeInTheDocument();
  });

  it("Annuleren sluit het bewerkformulier zonder te wijzigen, geen fetch-aanroep", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AanvullendeTrainingenPaneel schoolId="500" initieel={[TRAINING]} />);

    await user.click(screen.getByRole("button", { name: "Bewerken" }));
    await user.click(within(screen.getByLabelText("Training").closest("form")!).getByRole("button", { name: "Annuleren" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Coachgesprek rekenen")).toBeInTheDocument();
  });
});
