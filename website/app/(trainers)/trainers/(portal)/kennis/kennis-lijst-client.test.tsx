import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KennisLijstClient } from "./kennis-lijst-client";
import type { TrainerKennisversieOverzicht } from "@/lib/trainers/kennis";

// Vervolgronde (2026-08-22) — dekt de zoekbalk op /kennis (opdrachtseis:
// "trainer kan zoeken"). Zelfde opzet als scholen-lijst-client.test.tsx —
// geen fetch-/router-mock nodig: dit component doet geen netwerkverkeer en
// roept useRouter() niet aan.
const KENNISVERSIES: TrainerKennisversieOverzicht[] = [
  { id: 1, titel: "Periodevoorbereiding begeleiden", samenvatting: "Hoe je een school helpt bij het voorbereiden van een periode.", headings: [] },
  { id: 2, titel: "Kindgesprekken voeren", samenvatting: "Waar je op let tijdens een kindgesprek.", headings: [] },
  { id: 3, titel: "Montessori-materiaal introduceren", samenvatting: "Stapsgewijs nieuw materiaal introduceren bij een groep.", headings: [] },
];

describe("KennisLijstClient — zoekbalk", () => {
  it("toont alle kennisversies zonder zoekterm", () => {
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("filtert case-insensitief op titel, volgorde blijft behouden", async () => {
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "montessori");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Montessori-materiaal introduceren");
  });

  it("filtert ook op samenvatting-tekst, niet uitsluitend op titel", async () => {
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "kindgesprek");

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Kindgesprekken voeren")).toBeInTheDocument();
  });

  it("toont een rustige lege staat wanneer niets matcht", async () => {
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "xyz-onbestaand");

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/Geen kennisartikelen gevonden voor.*xyz-onbestaand/)).toBeInTheDocument();
  });

  it("toont een aparte lege staat wanneer er nog helemaal geen kennisartikelen zijn (leeg zonder zoekterm)", () => {
    render(<KennisLijstClient kennisversies={[]} />);
    expect(screen.getByText("Nog geen kennisartikelen gepubliceerd.")).toBeInTheDocument();
  });

  it("elke link wijst naar /kennis/[id]", () => {
    render(<KennisLijstClient kennisversies={KENNISVERSIES} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/kennis/1");
  });
});

// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
// (opdrachtseis §7): de zoekfunctie moet ook hoofdstukken kunnen vinden, bv.
// zoeken op "periode" toont een resultaat voor een hoofdstuk en linkt direct
// naar dat hoofdstuk (/kennis/[id]#slug).
describe("KennisLijstClient — zoekbalk vindt ook hoofdstukken", () => {
  const MET_HOOFDSTUKKEN: TrainerKennisversieOverzicht[] = [
    {
      id: 4,
      titel: "Basiskennis",
      samenvatting: "Alles over MijnLeerlijn.",
      headings: [
        { text: "4. De cyclus", slug: "4-de-cyclus" },
        { text: "4.1 Periode voorbereiden", slug: "4-1-periode-voorbereiden" },
        { text: "6. Hoe is een curriculum opgebouwd?", slug: "6-hoe-is-een-curriculum-opgebouwd" },
      ],
    },
  ];

  it("een zoekterm die alleen in een hoofdstuktitel voorkomt, levert een resultaat op dat naar dat hoofdstuk linkt", async () => {
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={MET_HOOFDSTUKKEN} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "periode voorbereiden");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/kennis/4#4-1-periode-voorbereiden");
    expect(links[0]).toHaveTextContent("Periode voorbereiden");
  });

  it("een hoofdstuk-match geeft precies dat hoofdstuk terug, geen valse treffer op documenttitel/samenvatting", async () => {
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={MET_HOOFDSTUKKEN} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "curriculum");

    // "curriculum" matcht uitsluitend het hoofdstuk "6. Hoe is een curriculum opgebouwd?", niet de documenttitel/samenvatting.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/kennis/4#6-hoe-is-een-curriculum-opgebouwd");
  });

  it("toont het document zelf én het gematchte hoofdstuk als de zoekterm in beide voorkomt", async () => {
    const metOverlap: TrainerKennisversieOverzicht[] = [
      {
        id: 5,
        titel: "Basiskennis",
        samenvatting: "Alles over de cyclus bij MijnLeerlijn.",
        headings: [{ text: "4. De cyclus", slug: "4-de-cyclus" }],
      },
    ];
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={metOverlap} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "cyclus");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.getAttribute("href")).sort()).toEqual(["/kennis/5", "/kennis/5#4-de-cyclus"]);
  });

  it("een zoekterm die uitsluitend de documenttitel matcht, blijft naar het hele document linken (geen hash)", async () => {
    const user = userEvent.setup();
    render(<KennisLijstClient kennisversies={MET_HOOFDSTUKKEN} />);

    await user.type(screen.getByLabelText("Zoek in basiskennis"), "basiskennis");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/kennis/4");
  });
});
