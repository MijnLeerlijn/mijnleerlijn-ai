import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileNavigation from "./MobileNavigation";

const items = [
  { label: "Categorieën", href: "/#ontdek" },
  { label: "Updates", href: "/#updates" },
];

describe("MobileNavigation", () => {
  it("rendert niets wanneer open=false", () => {
    render(<MobileNavigation items={items} open={false} onClose={() => undefined} />);
    expect(screen.queryByRole("navigation", { name: "Mobiele navigatie" })).not.toBeInTheDocument();
  });

  it("toont alle navigatie-items wanneer open=true", () => {
    render(<MobileNavigation items={items} open onClose={() => undefined} />);
    expect(screen.getByRole("link", { name: "Categorieën" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Updates" })).toBeInTheDocument();
  });

  it("sluit het menu bij het indrukken van Escape", async () => {
    const onClose = vi.fn();
    render(<MobileNavigation items={items} open onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sluit het menu bij het klikken op een link", async () => {
    const onClose = vi.fn();
    render(<MobileNavigation items={items} open onClose={onClose} />);
    await userEvent.click(screen.getByRole("link", { name: "Updates" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
