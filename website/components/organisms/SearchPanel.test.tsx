import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchPanel from "./SearchPanel";

// SearchPanel roept sinds Fase 5 de echte app/api/antwoord/route.ts aan
// (services/retrieval.ts/services/ai.ts, geen dummydata meer) — deze test
// bemockt uitsluitend die HTTP-grens, zodat SearchPanel's eigen
// laad/resultaat-weergave getest wordt, niet de echte database.
function mockFetch(reactie: (vraag: string) => Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const { vraag } = JSON.parse(String(init?.body ?? "{}"));
      return { ok: true, json: async () => reactie(vraag) } as Response;
    })
  );
}

describe("SearchPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toont voorbeeldvragen bij het openen, nog geen antwoord", () => {
    render(<SearchPanel />);
    expect(screen.getByRole("button", { name: /hoofdprofiel/i })).toBeInTheDocument();
    expect(screen.queryByText("Bronnen")).not.toBeInTheDocument();
  });

  it("toont een laadstatus en daarna het antwoord met bron(nen) bij een herkende vraag", async () => {
    mockFetch((vraag) => ({
      type: "antwoord",
      vraag,
      antwoord: "Open de groep en koppel de doelenset via het groepsmenu.",
      bronnen: [{ titel: "Doelenset koppelen", sectie: "Koppelen", datum: "2026-01-01", artikelSlug: "x" }],
    }));
    const user = userEvent.setup();
    render(<SearchPanel />);

    await user.type(screen.getByLabelText("Stel je vraag"), "Hoe koppel ik een doelenset aan een groep?");
    await user.click(screen.getByRole("button", { name: "Verstuur vraag" }));

    expect(await screen.findByText("Bronnen")).toBeInTheDocument();
  });

  it("toont de eerlijke 'geen antwoord'-staat bij een onbekende vraag, nooit een gegokt antwoord", async () => {
    mockFetch((vraag) => ({ type: "geen-antwoord", vraag, gerelateerd: [] }));
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
    mockFetch((vraag) => ({
      type: "antwoord",
      vraag,
      antwoord: "Log in als beheerder en maak een nieuw hoofdprofiel aan.",
      bronnen: [{ titel: "Hoofdprofiel aanmaken", sectie: "Starten", datum: "2026-01-01", artikelSlug: "y" }],
    }));
    render(<SearchPanel initieleVraag="Hoe maak ik een hoofdprofiel aan?" />);
    expect(await screen.findByText("Bronnen")).toBeInTheDocument();
  });
});
