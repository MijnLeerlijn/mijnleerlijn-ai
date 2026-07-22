import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "./Button";

describe("Button", () => {
  it("rendert children als tekst", () => {
    render(<Button>Versturen</Button>);
    expect(screen.getByRole("button", { name: "Versturen" })).toBeInTheDocument();
  });

  it("roept onClick aan bij een klik", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Klik mij</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Klik mij" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is uitgeschakeld en niet klikbaar wanneer disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Uitgeschakeld
      </Button>
    );
    const button = screen.getByRole("button", { name: "Uitgeschakeld" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is uitgeschakeld tijdens loading en toont geen custom icoon", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Bezig
      </Button>
    );
    const button = screen.getByRole("button", { name: /Bezig/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is bereikbaar via het toetsenbord (Tab + Enter activeert)", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Toetsenbord</Button>);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Toetsenbord" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
