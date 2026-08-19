import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrainingRij } from "./training-rij";

// TrainingRij roept useRouter() rechtstreeks aan (router.refresh() na een
// geslaagde schrijving) — buiten een echte Next-navigatiecontext geeft dat
// "invariant expected app router to be mounted". Zelfde patroon als
// components/layouts/KnowledgeLayout.test.tsx (daar via een gemockt
// kindcomponent, hier rechtstreeks op de hook omdat TrainingRij 'm zelf
// gebruikt) — dit test uitsluitend TrainingRij se eigen gedrag, niet
// Next.js se router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

// Traineromgeving V1, Ronde 2 vervolg (2026-08-19) — dekt de nieuwe
// StatusPopover/DatumPopover/TrainingRij-interactie die de grote modal
// vervangt. jsdom (dit project se testomgeving) mist een echte native HTML
// popover-API-implementatie (geen showPopover/hidePopover-methodes op
// HTMLElement.prototype), maar levert wél zijn eigen UA-stylesheetregel
// "[popover]:not(:popover-open) { display: none }"
// (node_modules/jsdom/lib/jsdom/browser/default-stylesheet.css) — zonder een
// echte showPopover()-koppeling aan :popover-open blijft elke
// <div popover="auto"> daardoor permanent onzichtbaar voor Testing Library
// se rolgebaseerde queries, ook al staat de inhoud gewoon in de DOM. Deze
// polyfill zet daarom een expliciete inline display (wint in de CSS-cascade
// van de niet-!important stylesheetregel hierboven) i.p.v. een kale no-op.
// Alleen voor dít testbestand (geen wijziging aan vitest.setup.ts). De
// werkelijke positionering en native light-dismiss (klik buiten/Escape)
// zijn in jsdom sowieso niet zinvol te testen — dat blijft de taak van de
// losse, ad-hoc Playwright-verificatie tegen een echte browser. React's
// eigen open-state (niet de native popover-zichtbaarheid) bepaalt hier wat
// er getoond wordt, dus de daadwerkelijke interactielogica (fetch-aanroepen,
// laad-/conflict-/foutweergave, retry) is hier wél volledig betrouwbaar te
// testen.
beforeAll(() => {
  if (!("showPopover" in HTMLElement.prototype)) {
    Object.assign(HTMLElement.prototype, {
      showPopover(this: HTMLElement) {
        this.style.display = "block";
      },
      hidePopover(this: HTMLElement) {
        this.style.display = "none";
      },
      togglePopover(this: HTMLElement) {
        const zichtbaar = this.style.display !== "none";
        this.style.display = zichtbaar ? "none" : "block";
        return !zichtbaar;
      },
    });
  }
});

const BEWERKBARE_TRAINING = {
  id: "700",
  naam: "Training Montessori Gorinchem",
  status: "open" as const,
  ruweStatusTekst: null,
  datum: null,
  trainerboardItemId: "800",
};

function mockFetchEenmaal(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function geschrevenResultaat(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kolomResultaten: [
      { record: "trainerboard", veld: "status", status: "geschreven", boodschap: "ok" },
      { record: "centraal", veld: "status", status: "geschreven", boodschap: "ok" },
    ],
    algeheleStatus: "volledig_geslaagd",
    opnieuwProberen: { trainerboard: false, centraal: false },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TrainingRij — StatusPopover", () => {
  it("toont de 4 statuskeuzes met hun labels zodra de statusbadge wordt aangeklikt", async () => {
    const user = userEvent.setup();
    render(<TrainingRij training={BEWERKBARE_TRAINING} />);

    await user.click(screen.getByRole("button", { name: "Nieuw" }));

    expect(screen.getByRole("button", { name: /Gepland/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gedaan/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Geannuleerd/ })).toBeInTheDocument();
  });

  it("stuurt bij het kiezen van een status een PATCH met de verwachte body en credentials: same-origin", async () => {
    const fetchMock = mockFetchEenmaal(200, geschrevenResultaat());
    const user = userEvent.setup();
    render(<TrainingRij training={BEWERKBARE_TRAINING} />);

    await user.click(screen.getByRole("button", { name: "Nieuw" }));
    await user.click(screen.getByRole("button", { name: /Gedaan/ }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trainers/trainingen/700",
      expect.objectContaining({
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } }),
      })
    );
  });

  it("toont een compacte succesbevestiging (statustekst blijft zichtbaar, niet uitsluitend kleur) na een geslaagde schrijving", async () => {
    mockFetchEenmaal(200, geschrevenResultaat());
    const user = userEvent.setup();
    render(<TrainingRij training={BEWERKBARE_TRAINING} />);

    await user.click(screen.getByRole("button", { name: "Nieuw" }));
    await user.click(screen.getByRole("button", { name: /Gedaan/ }));

    await waitFor(() => expect(screen.getAllByText("Opgeslagen")).toHaveLength(2)); // trainerboard + centraal, allebei geschreven
    expect(screen.getAllByText(/Status$/).length).toBeGreaterThan(0); // statustekst blijft zichtbaar, niet uitsluitend kleur
  });

  it("toont conflictdetails (laatst gezien/nu op Monday/gewenste wijziging) en een 'opnieuw proberen'-knop bij een conflict", async () => {
    mockFetchEenmaal(
      200,
      geschrevenResultaat({
        kolomResultaten: [
          {
            record: "centraal",
            veld: "status",
            status: "conflict",
            boodschap: "Conflict",
            conflict: { laatstGezienDoorTrainer: null, huidigOpMonday: "Geannuleerd", gebruikerWildeZetten: "gedaan" },
          },
        ],
        algeheleStatus: "geweigerd_conflict",
        opnieuwProberen: { trainerboard: false, centraal: true },
      })
    );
    const user = userEvent.setup();
    render(<TrainingRij training={BEWERKBARE_TRAINING} />);

    await user.click(screen.getByRole("button", { name: "Nieuw" }));
    await user.click(screen.getByRole("button", { name: /Gedaan/ }));

    await waitFor(() => expect(screen.getByText(/Nu op Monday: Geannuleerd/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Centrale training opnieuw proberen/ })).toBeInTheDocument();
  });

  it("'opnieuw proberen' stuurt een nieuw PATCH-verzoek met alleenRecord gescoped naar het mislukte record", async () => {
    const fetchMock = mockFetchEenmaal(
      200,
      geschrevenResultaat({
        kolomResultaten: [{ record: "trainerboard", veld: "status", status: "mislukt", boodschap: "Monday tijdelijk onbereikbaar" }],
        algeheleStatus: "volledig_mislukt",
        opnieuwProberen: { trainerboard: true, centraal: false },
      })
    );
    const user = userEvent.setup();
    render(<TrainingRij training={BEWERKBARE_TRAINING} />);

    await user.click(screen.getByRole("button", { name: "Nieuw" }));
    await user.click(screen.getByRole("button", { name: /Gedaan/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Trainerboard opnieuw proberen/ })).toBeInTheDocument());

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: /Trainerboard opnieuw proberen/ }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trainers/trainingen/700",
      expect.objectContaining({
        body: JSON.stringify({ status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null }, alleenRecord: "trainerboard" }),
      })
    );
  });

  it("toont een generieke foutmelding bij een netwerkfout, zonder de popover te laten crashen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    const user = userEvent.setup();
    render(<TrainingRij training={BEWERKBARE_TRAINING} />);

    await user.click(screen.getByRole("button", { name: "Nieuw" }));
    await user.click(screen.getByRole("button", { name: /Gedaan/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/verbinding/i));
  });
});

describe("TrainingRij — DatumPopover", () => {
  it("toont 'Datum plannen' zolang er nog geen datum is, en de aankondiging dat kiezen de status op Gepland zet", async () => {
    const user = userEvent.setup();
    render(<TrainingRij training={BEWERKBARE_TRAINING} />);

    await user.click(screen.getByRole("button", { name: /Datum plannen/ }));

    expect(screen.getByText(/automatisch op Gepland/)).toBeInTheDocument();
  });

  it("stuurt bij het kiezen van een datum een PATCH met de verwachte body", async () => {
    const fetchMock = mockFetchEenmaal(
      200,
      geschrevenResultaat({
        kolomResultaten: [
          { record: "trainerboard", veld: "datum", status: "geschreven", boodschap: "ok" },
          { record: "centraal", veld: "datum", status: "geschreven", boodschap: "ok" },
        ],
      })
    );
    const user = userEvent.setup();
    render(<TrainingRij training={BEWERKBARE_TRAINING} />);

    await user.click(screen.getByRole("button", { name: /Datum plannen/ }));
    const invoer = screen.getByLabelText("Datum plannen");
    await user.type(invoer, "2026-09-01");
    // Native <input type="date"> vuurt onChange pas bij een volledige waarde — userEvent.type op een date-input werkt hier onbetrouwbaar per segment, vandaar een directe fireEvent-achtige waarde-set als fallback.
    if (!fetchMock.mock.calls.length) {
      await user.click(document.body); // forceert een blur, sommige jsdom-date-input-implementaties committen dan alsnog
    }

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.datum.nieuweWaarde).toBe("2026-09-01");
    expect(body.datum.verwachteHuidigeWaarde).toBeNull();
  });

  it("toont geen 'Datum verwijderen' zolang er nog geen datum is", async () => {
    const user = userEvent.setup();
    render(<TrainingRij training={BEWERKBARE_TRAINING} />);
    await user.click(screen.getByRole("button", { name: /Datum plannen/ }));
    expect(screen.queryByRole("button", { name: /Datum verwijderen/ })).not.toBeInTheDocument();
  });

  it("toont 'Datum verwijderen' als secundaire actie zodra er al een datum is", async () => {
    // Een NIEUWE render (niet rerender() op dezelfde instance) — in de echte
    // app krijgt TrainingRij nooit een levende prop-wijziging op een reeds
    // gemount instance: na een geslaagde schrijving doet router.refresh() de
    // hele server-boom opnieuw ophalen, waardoor dit component met de nieuwe
    // training-data vers remount. baselineDatum (useState) volgt daarom
    // terecht alleen de INITIËLE prop, niet een latere prop-wijziging op
    // dezelfde instance.
    const user = userEvent.setup();
    render(<TrainingRij training={{ ...BEWERKBARE_TRAINING, datum: "2026-09-01" }} />);
    // Formattering is locale-afhankelijk (formatKorteDatum) — zoek daarom op
    // de accessible name via het label-patroon i.p.v. de exacte tekst.
    const triggers = screen.getAllByRole("button");
    const datumTrigger = triggers.find((el) => /2026|sep/i.test(el.textContent ?? ""));
    expect(datumTrigger).toBeTruthy();
    await user.click(datumTrigger!);
    expect(screen.getByRole("button", { name: /Datum verwijderen/ })).toBeInTheDocument();
  });
});

describe("TrainingRij — niet-bewerkbare training (geen trainerboardItemId)", () => {
  it("toont statische, niet-klikbare badge/datum in plaats van de popovers", () => {
    render(<TrainingRij training={{ ...BEWERKBARE_TRAINING, trainerboardItemId: null }} />);
    expect(screen.queryByRole("button", { name: "Nieuw" })).not.toBeInTheDocument();
    expect(screen.getByText("Nieuw")).toBeInTheDocument(); // wél als platte tekst/badge zichtbaar
  });
});
