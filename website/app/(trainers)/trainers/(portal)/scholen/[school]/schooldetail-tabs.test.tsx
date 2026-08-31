import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchooldetailTabs } from "./schooldetail-tabs";

// Schooldetail-UX-ronde (2026-08-25) — opdrachtseis: "Trainingen | Vraag aan
// AI | Logboek | Contactpersoon", Trainingen standaard actief, geen
// functionaliteit/databron gedupliceerd (elk paneel hier is een simpele
// marker-node — de ECHTE inhoud (TrainingSecties/TrainerVraagBlok/etc.)
// wordt door page.tsx aangeleverd en hier uitsluitend doorgegeven, dus dit
// bestand test bewust alleen de tab-ORKESTRATIE, niet de inhoud van de
// individuele panelen zelf — die hebben hun eigen testbestanden.
//
// Fase 3 (2026-08-23) — "Bestanden" toegevoegd tussen Logboek en Contactpersoon.
function renderTabs() {
  return render(
    <SchooldetailTabs
      trainingenPaneel={<p data-testid="paneel-trainingen">Trainingeninhoud</p>}
      aanvullendPaneel={<p data-testid="paneel-aanvullend">Aanvullendinhoud</p>}
      aiPaneel={<p data-testid="paneel-ai">AI-inhoud</p>}
      logboekPaneel={<p data-testid="paneel-logboek">Logboekinhoud</p>}
      bestandenPaneel={<p data-testid="paneel-bestanden">Bestandeninhoud</p>}
      contactpersoonPaneel={<p data-testid="paneel-contactpersoon">Contactpersooninhoud</p>}
    />
  );
}

describe("SchooldetailTabs", () => {
  it("toont de tabs in de juiste volgorde: Trainingen | Aanvullende trainingen | Vraag aan AI | Logboek | Bestanden | Contactpersoon", () => {
    renderTabs();
    const tabs = screen.getAllByRole("tab").map((el) => el.textContent);
    expect(tabs).toEqual(["Trainingen", "Aanvullende trainingen", "Vraag aan AI", "Logboek", "Bestanden", "Contactpersoon"]);
  });

  it("'Trainingen' is standaard de actieve tab", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: "Trainingen" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("paneel-trainingen")).toBeVisible();
    expect(screen.getByTestId("paneel-aanvullend")).not.toBeVisible();
    expect(screen.getByTestId("paneel-ai")).not.toBeVisible();
    expect(screen.getByTestId("paneel-logboek")).not.toBeVisible();
    expect(screen.getByTestId("paneel-bestanden")).not.toBeVisible();
    expect(screen.getByTestId("paneel-contactpersoon")).not.toBeVisible();
  });

  it("klikken op 'Aanvullende trainingen' toont uitsluitend dat paneel", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("tab", { name: "Aanvullende trainingen" }));

    expect(screen.getByRole("tab", { name: "Aanvullende trainingen" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("paneel-aanvullend")).toBeVisible();
    expect(screen.getByTestId("paneel-trainingen")).not.toBeVisible();
    expect(screen.getByTestId("paneel-ai")).not.toBeVisible();
    expect(screen.getByTestId("paneel-logboek")).not.toBeVisible();
    expect(screen.getByTestId("paneel-bestanden")).not.toBeVisible();
    expect(screen.getByTestId("paneel-contactpersoon")).not.toBeVisible();
  });

  it("klikken op een andere tab toont uitsluitend dat paneel", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("tab", { name: "Logboek" }));

    expect(screen.getByRole("tab", { name: "Logboek" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Trainingen" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("paneel-logboek")).toBeVisible();
    expect(screen.getByTestId("paneel-trainingen")).not.toBeVisible();
    expect(screen.getByTestId("paneel-ai")).not.toBeVisible();
    expect(screen.getByTestId("paneel-bestanden")).not.toBeVisible();
    expect(screen.getByTestId("paneel-contactpersoon")).not.toBeVisible();
  });

  it("klikken op 'Bestanden' toont uitsluitend dat paneel", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("tab", { name: "Bestanden" }));

    expect(screen.getByRole("tab", { name: "Bestanden" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("paneel-bestanden")).toBeVisible();
    expect(screen.getByTestId("paneel-trainingen")).not.toBeVisible();
    expect(screen.getByTestId("paneel-logboek")).not.toBeVisible();
    expect(screen.getByTestId("paneel-contactpersoon")).not.toBeVisible();
  });

  it("elk paneel komt precies één keer voor in de DOM, ook na tab-wissels (geen dubbele/gedupliceerde content)", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("tab", { name: "Vraag aan AI" }));
    await user.click(screen.getByRole("tab", { name: "Bestanden" }));
    await user.click(screen.getByRole("tab", { name: "Contactpersoon" }));
    await user.click(screen.getByRole("tab", { name: "Trainingen" }));

    expect(screen.getAllByTestId("paneel-trainingen")).toHaveLength(1);
    expect(screen.getAllByTestId("paneel-aanvullend")).toHaveLength(1);
    expect(screen.getAllByTestId("paneel-ai")).toHaveLength(1);
    expect(screen.getAllByTestId("paneel-logboek")).toHaveLength(1);
    expect(screen.getAllByTestId("paneel-bestanden")).toHaveLength(1);
    expect(screen.getAllByTestId("paneel-contactpersoon")).toHaveLength(1);
  });

  it("de tabbalk blijft op smalle schermen bruikbaar via horizontaal scrollen (overflow-x-auto), geen geplette tabs", () => {
    renderTabs();
    expect(screen.getByRole("tablist")).toHaveClass("overflow-x-auto");
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("shrink-0", "whitespace-nowrap");
    }
  });

  it("elke tab heeft aria-controls dat naar het bijbehorende paneel wijst (toegankelijkheid)", () => {
    renderTabs();
    const trainingenTab = screen.getByRole("tab", { name: "Trainingen" });
    expect(trainingenTab).toHaveAttribute("aria-controls", "schooldetail-paneel-trainingen");
    expect(screen.getByTestId("paneel-trainingen").closest('[role="tabpanel"]')).toHaveAttribute("id", "schooldetail-paneel-trainingen");
  });
});
