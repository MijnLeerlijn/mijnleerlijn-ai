import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ContactField from "./ContactField";

describe("ContactField", () => {
  it("koppelt het label correct aan het veld", () => {
    render(<ContactField label="Naam leerkracht" name="naam" />);
    expect(screen.getByLabelText("Naam leerkracht")).toBeInTheDocument();
  });

  it("toont geen foutmelding wanneer er geen error is", () => {
    render(<ContactField label="E-mail" name="email" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toont de foutmelding en koppelt die via aria-describedby", () => {
    render(<ContactField label="E-mail" name="email" error="Vul een geldig e-mailadres in" />);
    const veld = screen.getByLabelText("E-mail");
    const foutmelding = screen.getByRole("alert");

    expect(foutmelding).toHaveTextContent("Vul een geldig e-mailadres in");
    expect(veld).toHaveAttribute("aria-describedby", foutmelding.id);
    expect(veld).toHaveAttribute("aria-invalid", "true");
  });

  it("rendert een textarea wanneer multiline is meegegeven", () => {
    render(<ContactField label="Uitleg" name="uitleg" multiline />);
    expect(screen.getByLabelText("Uitleg").tagName).toBe("TEXTAREA");
  });

  it("markeert verplichte velden zowel visueel als voor screenreaders", () => {
    render(<ContactField label="Naam school" name="school" required />);
    expect(screen.getByText("(verplicht)")).toBeInTheDocument();
  });
});
