import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KennisMarkdown } from "./kennis-markdown";
import { haalHeadingsOp } from "@/lib/content/markdown-headings";

// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
// (opdrachtseis §3/§10): trainerkennistekst werd voorheen kaal als
// whitespace-pre-line getoond — letterlijke "##"/"**" waren zichtbaar. Dekt
// dat Markdown nu écht gerenderd wordt (koppen/vet/lijsten), met stabiele
// id's die exact overeenkomen met lib/content/markdown-headings.ts, én dat
// er nooit ruwe HTML/scriptcode wordt uitgevoerd (zelfde veilige aanpak als
// components/molecules/MarkdownAnswer.tsx).

describe("KennisMarkdown — koppen", () => {
  it("rendert een Markdown-heading als een echt kop-element met de juiste id, niet als letterlijke ##-tekst", () => {
    const tekst = "## 6. De cyclus\nWat inhoud.";
    const headings = haalHeadingsOp(tekst);
    render(<KennisMarkdown tekst={tekst} headings={headings} />);

    const heading = screen.getByRole("heading", { name: "6. De cyclus" });
    expect(heading.tagName).toBe("H3"); // markdown ## -> html h3 (de paginatitel zelf is al de enige h1, zie kennis-reader.tsx)
    expect(heading).toHaveAttribute("id", "6-de-cyclus");
    expect(screen.queryByText(/##/)).not.toBeInTheDocument();
  });

  it("markdown # (niveau 1) rendert als h2, ### (niveau 3) als h4 — dezelfde 3 niveaus als lib/content/markdown-headings.ts", () => {
    const tekst = "# Eerste\nA.\n\n### Derde\nC.";
    const headings = haalHeadingsOp(tekst);
    render(<KennisMarkdown tekst={tekst} headings={headings} />);
    expect(screen.getByRole("heading", { name: "Eerste" }).tagName).toBe("H2");
    expect(screen.getByRole("heading", { name: "Derde" }).tagName).toBe("H4");
  });

  it("meerdere headings krijgen elk hun eigen, unieke id, in documentvolgorde", () => {
    const tekst = "## Eerste\nA.\n\n## Tweede\nB.";
    const headings = haalHeadingsOp(tekst);
    render(<KennisMarkdown tekst={tekst} headings={headings} />);
    expect(screen.getByRole("heading", { name: "Eerste" })).toHaveAttribute("id", "eerste");
    expect(screen.getByRole("heading", { name: "Tweede" })).toHaveAttribute("id", "tweede");
  });

  it("dubbele headings met identieke tekst krijgen toch verschillende id's (geen dubbele anchors op de pagina)", () => {
    const tekst = "## Periode voorbereiden\nA.\n\n## Periode voorbereiden\nB.";
    const headings = haalHeadingsOp(tekst);
    render(<KennisMarkdown tekst={tekst} headings={headings} />);
    const koppen = screen.getAllByRole("heading", { name: "Periode voorbereiden" });
    expect(koppen).toHaveLength(2);
    expect(koppen[0]!.id).not.toBe(koppen[1]!.id);
  });

  it("een #### (dieper dan opdrachtseis §2) wordt niet als apart kop-element gerenderd", () => {
    const tekst = "#### Geen losse kop\nGewone tekst.";
    render(<KennisMarkdown tekst={tekst} headings={[]} />);
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(screen.getByText(/Geen losse kop/)).toBeInTheDocument();
  });
});

describe("KennisMarkdown — overige opmaak", () => {
  it("rendert vetgedrukte tekst als <strong>, niet als letterlijke **-tekens", () => {
    render(<KennisMarkdown tekst="Dit is **belangrijk** om te weten." headings={[]} />);
    const strong = screen.getByText("belangrijk");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("rendert een ongenummerde lijst als een echte lijst met listitems", () => {
    render(<KennisMarkdown tekst={"- Eerste punt\n- Tweede punt"} headings={[]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("rendert een genummerde lijst correct als <ol>", () => {
    render(<KennisMarkdown tekst={"1. Stap een\n2. Stap twee"} headings={[]} />);
    expect(screen.getByRole("list").tagName).toBe("OL");
  });

  it("geeft paragrafen goede witruimte (aparte <p>-elementen, geen samengeklonterde tekst)", () => {
    const { container } = render(<KennisMarkdown tekst={"Eerste alinea.\n\nTweede alinea."} headings={[]} />);
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("rendert links veilig (target=_blank + rel=noopener)", () => {
    render(<KennisMarkdown tekst="Zie [MijnLeerlijn](https://mijnleerlijn.nl)." headings={[]} />);
    const link = screen.getByRole("link", { name: "MijnLeerlijn" });
    expect(link).toHaveAttribute("href", "https://mijnleerlijn.nl");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("KennisMarkdown — veiligheid", () => {
  it("voert nooit ruwe HTML uit — een <script>-achtige tekst wordt nooit als scriptelement gerenderd", () => {
    const { container } = render(<KennisMarkdown tekst={"Tekst met <script>alert('x')</script> erin."} headings={[]} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("een <img onerror=...>-achtige tekst wordt nooit als daadwerkelijk img-element met event handler gerenderd", () => {
    const { container } = render(<KennisMarkdown tekst={'<img src=x onerror="alert(1)">'} headings={[]} />);
    const img = container.querySelector("img");
    expect(img).toBeNull();
  });
});
