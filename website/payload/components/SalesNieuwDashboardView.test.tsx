import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { bouwNieuwDashboard, type NieuwDashboardSchool } from "@/lib/sales/nieuw-dashboard";
import { SCHOLEN_KOLOM } from "@/lib/sales/monday-columns";
import { SalesNieuwDashboardInhoud } from "./SalesNieuwDashboardView";

const scholen: NieuwDashboardSchool[] = [
  { id: "a", relatiestatus: "Klant", licenties: 100, onderwijstypen: ["Montessori"], bronnen: ["Direct"], klantGeworden: null, naam: "De Voorbeeldschool" },
  { id: "b", relatiestatus: "Lead", licenties: 40, onderwijstypen: ["Dalton"], bronnen: ["Website"], klantGeworden: null },
];

const model = bouwNieuwDashboard({
  scholen,
  historie: [{ mondayItemId: "a", columnId: SCHOLEN_KOLOM.relatiestatus, occurredAt: "2026-10-02T12:00:00.000Z", previousValue: "Lead", value: "Klant" }],
  doelen: [{ id: 1, naam: "H2 2026", startDatum: "2026-07-01", eindDatum: "2026-12-31", doelLicenties: 4200, actief: true }],
  nu: Date.parse("2026-10-29T12:00:00.000Z"),
  factor: 200,
  bijgewerktOp: "2026-10-29T08:00:00.000Z",
});

function toon(eenheid: "licenties" | "scholen") {
  render(
    <SalesNieuwDashboardInhoud
      data={model}
      schakelaar={<div>Huidig dashboard</div>}
      eenheid={eenheid}
      periode="half"
      onEenheid={vi.fn()}
      onPeriode={vi.fn()}
      typeFilter="Alle"
      onType={vi.fn()}
      fout={null}
    />,
  );
}

describe("nieuw dashboard — weergave", () => {
  it("toont licenties als grote getallen, inclusief het maandverschil", () => {
    toon("licenties");
    expect(screen.getByText("Licenties bij klanten")).toBeInTheDocument();
    expect(screen.getAllByText("100").length).toBeGreaterThan(0);
    expect(screen.getByText("Bijgewerkt uit Monday: 29 oktober 2026 om 09:00")).toBeInTheDocument();
    expect(screen.getByText("+100 deze maand")).toBeInTheDocument();
    expect(screen.getByText("Erbij")).toBeInTheDocument();
    expect(screen.getByText("Pipeline per maand")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /okt.? 2026/i })[0]!);
    expect(screen.getByText("De Voorbeeldschool")).toBeInTheDocument();
  });

  it("klapt een halfjaar open en toont de school met licenties", () => {
    const data = bouwNieuwDashboard({
      scholen: [
        { id: "gouwe", relatiestatus: "Klant", licenties: 26, onderwijstypen: [], bronnen: [], klantGeworden: "1e helft 2026", naam: "OBS de Gouwe" },
        { id: "abeel", relatiestatus: "Klant", licenties: 305, onderwijstypen: [], bronnen: [], klantGeworden: "2e helft 2026", naam: "De Abeel" },
        { id: "zeggelt", relatiestatus: "Wacht op handtekening", licenties: 80, onderwijstypen: [], bronnen: [], klantGeworden: "", naam: "OMBS Het Zeggelt" },
      ],
      historie: [],
      doelen: [],
      nu: Date.parse("2026-10-29T12:00:00.000Z"),
      factor: 200,
      bijgewerktOp: "2026-10-29T08:00:00.000Z",
    });
    render(
      <SalesNieuwDashboardInhoud
        data={data}
        schakelaar={<div>Huidig dashboard</div>}
        eenheid="scholen"
        periode="half"
        onEenheid={vi.fn()}
        onPeriode={vi.fn()}
        typeFilter="Alle"
        onType={vi.fn()}
        fout={null}
        openHalfjaar="H1 2026"
      />,
    );
    expect(screen.getByRole("button", { name: "H1 2026" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("OBS de Gouwe")).toBeInTheDocument();
    expect(screen.getByText("26 licenties")).toBeInTheDocument();
    expect(screen.queryByText("OMBS Het Zeggelt")).not.toBeInTheDocument();
    expect(screen.queryByText("De Abeel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "H2 2026lopend" }));
    expect(screen.getByText("De Abeel")).toBeInTheDocument();
    expect(screen.getByText("305 licenties")).toBeInTheDocument();
  });

  it("toont in de scholenstand het aantal scholen in plaats van de licenties", () => {
    toon("scholen");
    expect(screen.getByText("Scholen die klant zijn")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Licenties bij klanten")).not.toBeInTheDocument();
  });
});
