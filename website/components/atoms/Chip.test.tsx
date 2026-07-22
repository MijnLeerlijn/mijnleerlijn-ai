import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Chip from "./Chip";

describe("Chip", () => {
  it("rendert als span (niet-interactief) zonder onClick", () => {
    render(<Chip>Alleen een tag</Chip>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Alleen een tag")).toBeInTheDocument();
  });

  it("rendert als knop met aria-pressed wanneer onClick is meegegeven", () => {
    render(
      <Chip onClick={() => undefined} selected>
        Voorbeeldvraag
      </Chip>
    );
    const knop = screen.getByRole("button", { name: "Voorbeeldvraag" });
    expect(knop).toHaveAttribute("aria-pressed", "true");
  });

  it("roept onClick aan bij klik en bij toetsenbordactivatie", async () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Klik mij</Chip>);
    const knop = screen.getByRole("button", { name: "Klik mij" });

    await userEvent.click(knop);
    expect(onClick).toHaveBeenCalledTimes(1);

    knop.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
