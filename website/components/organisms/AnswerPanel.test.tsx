import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AnswerPanel from "./AnswerPanel";

const bron = {
  titel: "Doelenset koppelen aan leerlingen",
  sectie: "Een doelenset koppelen",
  datum: "14 mei 2026",
};

describe("AnswerPanel", () => {
  it("toont de antwoordtekst en de bron", () => {
    render(<AnswerPanel tekst="Dit is het antwoord." bronnen={[bron]} />);
    expect(screen.getByText("Dit is het antwoord.")).toBeInTheDocument();
    expect(screen.getByText("Doelenset koppelen aan leerlingen")).toBeInTheDocument();
  });

  it("toont meerdere bronnen onder hetzelfde antwoord (nooit losse resultaten)", () => {
    const tweedeBron = { titel: "Automatisch doelen koppelen", sectie: "Instellen", datum: "14 mei 2026" };
    render(<AnswerPanel tekst="Antwoord met twee bronnen." bronnen={[bron, tweedeBron]} />);
    expect(screen.getAllByText(/Bijgewerkt:/)).toHaveLength(2);
  });

  it("toont geen 'Bedoelde je ook'-sectie zonder suggesties", () => {
    render(<AnswerPanel tekst="Antwoord zonder suggesties." bronnen={[bron]} />);
    expect(screen.queryByText(/Bedoelde je misschien ook/)).not.toBeInTheDocument();
  });

  it("toont de 'Bedoelde je ook'-sectie met suggesties", () => {
    render(<AnswerPanel tekst="Ambigue vraag." bronnen={[bron]} suggesties={["Een document verwijderen"]} />);
    expect(screen.getByText(/Bedoelde je misschien ook/)).toBeInTheDocument();
    expect(screen.getByText("Een document verwijderen")).toBeInTheDocument();
  });
});
