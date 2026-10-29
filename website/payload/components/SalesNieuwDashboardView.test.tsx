import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { bouwNieuwDashboard, type NieuwDashboardModel, type NieuwDashboardSchool } from "@/lib/sales/nieuw-dashboard";
import { SCHOLEN_KOLOM } from "@/lib/sales/monday-columns";
import { SalesNieuwDashboardInhoud, SalesNieuwDashboardView } from "./SalesNieuwDashboardView";

const auth = vi.hoisted(() => ({ user: { role: "admin", permissionMode: "full" } as { role: string; permissionMode: string } | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/sales",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@payloadcms/ui", () => ({
  useAuth: () => ({ user: auth.user }),
  Gutter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={["gutter", "gutter--left", "gutter--right", className].filter(Boolean).join(" ")}>{children}</div>
  ),
}));

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

  it("toont de sync-knop alleen voor een beheerder en geeft laden en een fout door", () => {
    toon("licenties");
    expect(screen.queryByRole("button", { name: "Sync met Monday" })).not.toBeInTheDocument();
  });

  it("zet de sync-knop uit en toont een laadindicator zolang de sync loopt", () => {
    render(
      <SalesNieuwDashboardInhoud
        data={model}
        schakelaar={<div>Huidig dashboard</div>}
        eenheid="licenties"
        periode="half"
        onEenheid={vi.fn()}
        onPeriode={vi.fn()}
        typeFilter="Alle"
        onType={vi.fn()}
        fout="Synchroniseren is mislukt of niet toegestaan voor dit account."
        magSyncen
        syncBezig
      />,
    );
    const knop = screen.getByRole("button", { name: "Synchroniseren…" });
    expect(knop).toBeDisabled();
    expect(knop).toHaveAttribute("aria-busy", "true");
    expect(knop.querySelector("[aria-hidden='true']")).toBeTruthy();
    expect(screen.getByText("Synchroniseren is mislukt of niet toegestaan voor dit account.")).toBeInTheDocument();
    expect(document.querySelector(".gutter--left.gutter--right")).toBeTruthy();
  });

  it("toont in de scholenstand het aantal scholen in plaats van de licenties", () => {
    toon("scholen");
    expect(screen.getByText("Scholen die klant zijn")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Licenties bij klanten")).not.toBeInTheDocument();
  });
});

describe("nieuw dashboard — sync met Monday", () => {
  function antwoord(body: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => body };
  }

  it("synct via de bestaande route en haalt daarna de nieuwe stand op", async () => {
    auth.user = { role: "admin", permissionMode: "full" };
    const later = { ...model, bijgewerktOp: "2026-10-29T16:30:00.000Z", klanten: { scholen: 3, licenties: 250 } } satisfies NieuwDashboardModel;
    let dashboardKeer = 0;
    let maakSyncKlaar: (waarde: unknown) => void = () => undefined;
    const syncKlaar = new Promise((resolve) => { maakSyncKlaar = resolve; });
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === "/api/sales/sync") {
        await syncKlaar;
        return antwoord({ ok: true });
      }
      dashboardKeer += 1;
      return antwoord(dashboardKeer === 1 ? model : later);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesNieuwDashboardView schakelaar={<div>Huidig dashboard</div>} />);
    expect(await screen.findByText("Bijgewerkt uit Monday: 29 oktober 2026 om 09:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sync met Monday" }));
    const bezig = await screen.findByRole("button", { name: "Synchroniseren…" });
    expect(bezig).toBeDisabled();
    expect(bezig).toHaveAttribute("aria-busy", "true");
    maakSyncKlaar(undefined);
    await waitFor(() => expect(screen.getByText("Bijgewerkt uit Monday: 29 oktober 2026 om 17:30")).toBeInTheDocument());
    expect(screen.getByText("250")).toBeInTheDocument();
    const syncAanroep = fetchMock.mock.calls.find((aanroep) => aanroep[0] === "/api/sales/sync");
    expect(syncAanroep?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(fetchMock.mock.calls.filter((aanroep) => aanroep[0] === "/api/sales/dashboard-nieuw")).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("toont een Nederlandse fout en laat de knop daarna weer vrij", async () => {
    auth.user = { role: "admin", permissionMode: "full" };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/sales/sync") return antwoord({ error: "nee" }, false, 500);
      return antwoord(model);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesNieuwDashboardView schakelaar={<div>Huidig dashboard</div>} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync met Monday" }));
    expect(await screen.findByText("Synchroniseren is mislukt of niet toegestaan voor dit account.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync met Monday" })).toBeEnabled();
    vi.unstubAllGlobals();
  });

  it("verbergt de knop voor een beperkte beheerder", async () => {
    auth.user = { role: "admin", permissionMode: "restricted" };
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(model)));
    render(<SalesNieuwDashboardView schakelaar={<div>Huidig dashboard</div>} />);
    expect(await screen.findByText("Licenties bij klanten")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync met Monday" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
