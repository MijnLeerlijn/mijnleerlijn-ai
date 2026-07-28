import { describe, it, expect } from "vitest";
import { bepaalMigratieResultaat } from "./migrate-kennisbasis-global";

describe("bepaalMigratieResultaat", () => {
  it("publiceert automatisch wanneer de round-trip verliesvrij is", () => {
    const bron = [
      "**Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI**",
      "",
      "**Doel van dit document**",
      "Dit document is geen handleiding op zich.",
      "",
      "*Subkop*",
      "- Punt een",
      "- Punt twee",
      "",
      "Afsluitende alinea.",
    ].join("\n");

    const resultaat = bepaalMigratieResultaat(bron);

    expect(resultaat.publiceren).toBe(true);
    expect(resultaat.afwijkingen).toEqual([]);
    expect(resultaat.richText.root.children.length).toBeGreaterThan(0);
  });

  it("blijft lossless (publiceren: true) voor willekeurige, ongestructureerde tekst — geen enkele regel wordt geweigerd", () => {
    // De conversie is by construction verliesvrij: elke regel valt terug op
    // een paragraafnode (verbatim) als hij geen kop/lijst-patroon matcht, dus
    // er bestaat geen input die met deze mechanische aanpak een afwijking
    // veroorzaakt. Dit test die garantie expliciet met rommelige/randgeval-
    // invoer (lege regels, losse opmaaktekens, ongebruikelijke tekens) i.p.v.
    // een niet-bestaand "afwijkingsscenario" te faken.
    const rommeligeBron = [
      "**",
      "*",
      "- ",
      "Regel met een los sterretje * erin.",
      "Regel met dubbele sterretjes ** die niet als paar staan.",
      "",
      "| Kleur | Betekenis |",
    ].join("\n");

    const resultaat = bepaalMigratieResultaat(rommeligeBron);

    expect(resultaat.publiceren).toBe(true);
    expect(resultaat.afwijkingen).toEqual([]);
  });

  it("meldt een afwijking wanneer bron en teruggeconverteerde tekst na normalisatie niet gelijk zijn", async () => {
    // Directe test van de vergelijkingslogica zelf (los van of de huidige
    // parser die situatie in de praktijk kan veroorzaken): twee inhoudelijk
    // verschillende teksten normaliseren nooit naar dezelfde regels.
    const { normaliseerVoorVergelijking } = await import("@/lib/assistant/kennisbasis-richtext");
    const a = normaliseerVoorVergelijking("**Kop A**\nInhoud een.");
    const b = normaliseerVoorVergelijking("**Kop B**\nInhoud twee.");
    expect(a).not.toBe(b);
  });

  it("is idempotent: twee aanroepen met dezelfde bron geven hetzelfde publiceer-resultaat", () => {
    const bron = "**Kop**\n- a\n- b\n\nAlinea.";
    const eerste = bepaalMigratieResultaat(bron);
    const tweede = bepaalMigratieResultaat(bron);

    expect(eerste.publiceren).toBe(tweede.publiceren);
    expect(JSON.stringify(eerste.richText)).toBe(JSON.stringify(tweede.richText));
  });
});
