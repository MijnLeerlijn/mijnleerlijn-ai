import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogboekForm } from "./logboek-form";

// Traineromgeving V2, Fase 1 (2026-08-28) — dekt het "+ Logboekitem"-
// formulier. LogboekForm roept useRouter() aan (push()/refresh() na een
// geslaagde opslag) — zelfde mockpatroon als training-rij.test.tsx (buiten
// een echte Next-navigatiecontext geeft dat "invariant expected app router
// to be mounted").
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

const SCHOLEN = [
  { id: "500", naam: "School A" },
  { id: "501", naam: "School B" },
];

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LogboekForm", () => {
  it("de opslaanknop is uitgeschakeld zolang school/type/notitie niet allemaal ingevuld zijn", async () => {
    const user = userEvent.setup();
    render(<LogboekForm scholen={SCHOLEN} />);

    const knop = screen.getByRole("button", { name: /logboekitem opslaan/i });
    expect(knop).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/school/i), "500");
    expect(knop).toBeDisabled(); // type en notitie nog leeg

    await user.selectOptions(screen.getByLabelText(/type contact/i), "telefonisch");
    expect(knop).toBeDisabled(); // notitie nog leeg

    await user.type(screen.getByLabelText(/notitie/i), "Gebeld over de planning.");
    expect(knop).not.toBeDisabled();
  });

  it("verzendt de exacte, ingevulde velden naar /api/trainers/logboek en navigeert bij succes naar /logboek", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ item: { id: 1 } }) } as Response);

    render(<LogboekForm scholen={SCHOLEN} />);

    await user.selectOptions(screen.getByLabelText(/school/i), "501");
    await user.selectOptions(screen.getByLabelText(/type contact/i), "helpdesk");
    await user.type(screen.getByLabelText(/notitie/i), "Vraag over inloggen.");
    await user.click(screen.getByRole("button", { name: /logboekitem opslaan/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, opts] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("/api/trainers/logboek");
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.mondaySchoolId).toBe("501");
    expect(body.type).toBe("helpdesk");
    expect(body.tekst).toBe("Vraag over inloggen.");

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/logboek"));
  });

  it("navigeert terug naar de school (niet /logboek) als de school vooringevuld was — 'niet opnieuw hoeven zoeken'", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ item: { id: 1 } }) } as Response);

    render(<LogboekForm scholen={SCHOLEN} vooringevuldeSchoolId="500" />);
    expect(screen.getByLabelText(/school/i)).toHaveValue("500");

    await user.selectOptions(screen.getByLabelText(/type contact/i), "overleg");
    await user.type(screen.getByLabelText(/notitie/i), "Kort overleg gehad.");
    await user.click(screen.getByRole("button", { name: /logboekitem opslaan/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/scholen/500"));
  });

  it("toont de foutmelding van de server en blijft op de pagina bij een mislukte opslag", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "School niet gevonden." }) } as Response);

    render(<LogboekForm scholen={SCHOLEN} />);
    await user.selectOptions(screen.getByLabelText(/school/i), "500");
    await user.selectOptions(screen.getByLabelText(/type contact/i), "notitie");
    await user.type(screen.getByLabelText(/notitie/i), "Test.");
    await user.click(screen.getByRole("button", { name: /logboekitem opslaan/i }));

    expect(await screen.findByText("School niet gevonden.")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
