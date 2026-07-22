import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchPanel from "./SearchPanel";

describe("SearchPanel", () => {
  it("toont voorbeeldvragen bij het openen, nog geen antwoord", () => {
    render(<SearchPanel />);
    expect(screen.getByRole("button", { name: /hoofdprofiel/i })).toBeInTheDocument();
    expect(screen.queryByText("Bronnen")).not.toBeInTheDocument();
  });

  it("toont een laadstatus en daarna het antwoord met bron(nen) bij een herkende vraag", async () => {
    const user = userEvent.setup();
    render(<SearchPanel />);

    await user.type(screen.getByLabelText("Stel je vraag"), "Hoe koppel ik een doelenset aan een groep?");
    await user.click(screen.getByRole("button", { name: "Verstuur vraag" }));

    expect(await screen.findByText("Bronnen")).toBeInTheDocument();
  });

  it("toont de eerlijke 'geen antwoord'-staat bij een onbekende vraag, nooit een gegokt antwoord", async () => {
    const user = userEvent.setup();
    render(<SearchPanel />);

    await user.type(screen.getByLabelText("Stel je vraag"), "wibbeldewob nergens gerelateerd aan onderwijs");
    await user.click(screen.getByRole("button", { name: "Verstuur vraag" }));

    expect(
      await screen.findByText("Dit weten we hier nog niet zeker genoeg om je een goed antwoord te geven.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Bronnen")).not.toBeInTheDocument();
  });

  it("start direct met laden en toont het resultaat wanneer een initiële vraag is meegegeven", async () => {
    render(<SearchPanel initieleVraag="Hoe maak ik een hoofdprofiel aan?" />);
    expect(await screen.findByText("Bronnen")).toBeInTheDocument();
  });
});
