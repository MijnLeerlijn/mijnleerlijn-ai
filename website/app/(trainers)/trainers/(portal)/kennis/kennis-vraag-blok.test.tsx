import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KennisVraagBlok } from "./kennis-vraag-blok";

// Vervolgronde (2026-08-22) — dekt "bronartikelen worden bij antwoord
// weergegeven" (opdrachtseis testlijst Kennis) op UI-niveau, als aanvulling
// op de API-laagtests in app/api/trainers/kennis/vraag/route.test.ts. Mockt
// uitsluitend fetch() — geen next/navigation-mock nodig, dit component roept
// useRouter() niet aan.
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KennisVraagBlok", () => {
  it("toont de exacte, opdrachtseis-voorgeschreven titel", () => {
    render(<KennisVraagBlok />);
    expect(screen.getByText("Stel een vraag over MijnLeerlijn en onze werkwijze")).toBeInTheDocument();
  });

  it("toont het antwoord én de gebruikte bronartikelen als klikbare links na een geslaagd antwoord", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ antwoord: "Zo begeleid je dit.", bronnen: [{ id: 5, titel: "Periodevoorbereiding", heading: null, headingSlug: null }] }),
    });
    const user = userEvent.setup();
    render(<KennisVraagBlok />);

    await user.type(screen.getByLabelText("Je vraag over MijnLeerlijn en onze werkwijze"), "Hoe begeleid ik dit?");
    await user.click(screen.getByRole("button", { name: "Vraag" }));

    expect(await screen.findByText("Zo begeleid je dit.")).toBeInTheDocument();
    expect(screen.getByText("Periodevoorbereiding")).toBeInTheDocument();
    const bronLink = screen.getByRole("link", { name: /Bekijk artikel/ });
    expect(bronLink).toHaveAttribute("href", "/kennis/5");
  });

  // Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
  // (opdrachtseis §5): een bron met headingSlug krijgt een "Bekijk
  // hoofdstuk"-link naar het exacte hoofdstuk, niet naar het hele document.
  it("toont een 'Bekijk hoofdstuk'-link naar /kennis/[id]#slug wanneer een bron hoofdstukmetadata heeft", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        antwoord: "Zo werkt de cyclus.",
        bronnen: [{ id: 1, titel: "Basiskennis", heading: "6. Hoe is een curriculum opgebouwd?", headingSlug: "6-hoe-is-een-curriculum-opgebouwd" }],
      }),
    });
    const user = userEvent.setup();
    render(<KennisVraagBlok />);

    await user.type(screen.getByLabelText("Je vraag over MijnLeerlijn en onze werkwijze"), "Hoe werkt de cyclus?");
    await user.click(screen.getByRole("button", { name: "Vraag" }));

    await screen.findByText("Zo werkt de cyclus.");
    expect(screen.getByText("6. Hoe is een curriculum opgebouwd?")).toBeInTheDocument();
    const bronLink = screen.getByRole("link", { name: /Bekijk hoofdstuk/ });
    expect(bronLink).toHaveAttribute("href", "/kennis/1#6-hoe-is-een-curriculum-opgebouwd");
  });

  it("meerdere bronnen van hetzelfde document maar verschillende hoofdstukken tonen allebei een eigen 'Bekijk hoofdstuk'-link", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        antwoord: "Antwoord.",
        bronnen: [
          { id: 1, titel: "Basiskennis", heading: "1. Hoofdstuk A", headingSlug: "1-hoofdstuk-a" },
          { id: 1, titel: "Basiskennis", heading: "2. Hoofdstuk B", headingSlug: "2-hoofdstuk-b" },
        ],
      }),
    });
    const user = userEvent.setup();
    render(<KennisVraagBlok />);

    await user.type(screen.getByLabelText("Je vraag over MijnLeerlijn en onze werkwijze"), "Vraag");
    await user.click(screen.getByRole("button", { name: "Vraag" }));

    await screen.findByText("Antwoord.");
    const links = screen.getAllByRole("link", { name: /Bekijk hoofdstuk/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/kennis/1#1-hoofdstuk-a", "/kennis/1#2-hoofdstuk-b"]);
  });

  it("toont geen bronnenlijst wanneer er geen bronnen zijn (de eerlijke fallback)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ antwoord: "Daarover heb ik in de beschikbare trainerkennis nog onvoldoende informatie.", bronnen: [] }),
    });
    const user = userEvent.setup();
    render(<KennisVraagBlok />);

    await user.type(screen.getByLabelText("Je vraag over MijnLeerlijn en onze werkwijze"), "Een vraag zonder dekking");
    await user.click(screen.getByRole("button", { name: "Vraag" }));

    expect(await screen.findByText("Daarover heb ik in de beschikbare trainerkennis nog onvoldoende informatie.")).toBeInTheDocument();
    expect(screen.queryByText("Gebruikte kennisartikelen")).not.toBeInTheDocument();
  });

  it("toont een foutmelding wanneer de aanvraag mislukt", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Vraag stellen mislukt. Probeer het opnieuw." }) });
    const user = userEvent.setup();
    render(<KennisVraagBlok />);

    await user.type(screen.getByLabelText("Je vraag over MijnLeerlijn en onze werkwijze"), "Vraag");
    await user.click(screen.getByRole("button", { name: "Vraag" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Vraag stellen mislukt. Probeer het opnieuw.");
  });

  it("'Nieuwe vraag stellen' herstelt het invoerveld", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ antwoord: "Antwoord.", bronnen: [] }) });
    const user = userEvent.setup();
    render(<KennisVraagBlok />);

    await user.type(screen.getByLabelText("Je vraag over MijnLeerlijn en onze werkwijze"), "Vraag");
    await user.click(screen.getByRole("button", { name: "Vraag" }));
    await screen.findByText("Antwoord.");

    await user.click(screen.getByRole("button", { name: "Nieuwe vraag stellen" }));
    expect(screen.getByLabelText("Je vraag over MijnLeerlijn en onze werkwijze")).toHaveValue("");
  });
});
