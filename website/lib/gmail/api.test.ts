import { describe, it, expect } from "vitest";
import { parseAddressList, htmlToPlainText } from "./api";

describe("parseAddressList", () => {
  it("splitst eenvoudige komma-gescheiden adressen", () => {
    expect(parseAddressList("a@b.nl, c@d.nl")).toEqual(["a@b.nl", "c@d.nl"]);
  });

  it("splitst 'Naam <adres>'-vorm zonder de naam te verliezen", () => {
    expect(parseAddressList("Jan Jansen <jan@school.nl>")).toEqual(["Jan Jansen <jan@school.nl>"]);
  });

  it("respecteert komma's binnen aanhalingstekens (achternaam, voornaam)", () => {
    expect(parseAddressList('"Jansen, Jan" <jan@school.nl>, c@d.nl')).toEqual([
      '"Jansen, Jan" <jan@school.nl>',
      "c@d.nl",
    ]);
  });

  it("geeft een lege lijst voor een lege header", () => {
    expect(parseAddressList("")).toEqual([]);
  });
});

describe("htmlToPlainText", () => {
  it("zet <br> en sluitende blokelementen om in regeleinden", () => {
    expect(htmlToPlainText("<p>Regel een<br>Regel twee</p><div>Regel drie</div>")).toBe(
      "Regel een\nRegel twee\nRegel drie"
    );
  });

  it("strip resterende tags maar behoudt de tekst", () => {
    expect(htmlToPlainText("<span>Hallo <b>wereld</b></span>")).toBe("Hallo wereld");
  });

  it("decodeert de gangbare HTML-entities", () => {
    expect(htmlToPlainText("Tom &amp; Jerry &lt;test&gt; &quot;citaat&quot; ruimte&nbsp;hier")).toBe(
      'Tom & Jerry <test> "citaat" ruimte hier'
    );
  });

  it("verwijdert geciteerde tekst NIET agressief — bewaart liever te veel dan te weinig", () => {
    const metCitaat = "<div>Mijn antwoord</div><div>Op 1 jan schreef X:<br>&gt; origineel bericht</div>";
    const resultaat = htmlToPlainText(metCitaat);
    expect(resultaat).toContain("Mijn antwoord");
    expect(resultaat).toContain("origineel bericht");
  });
});
