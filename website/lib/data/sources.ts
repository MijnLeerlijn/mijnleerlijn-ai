export interface Bron {
  titel: string;
  sectie: string;
  /** ISO-datum — weergave via lib/format/date.ts (formatDatumNL). */
  datum: string;
  artikelSlug: string;
}

// 15 bronnen, elk verwijzend naar een echte sectie in een bestaand artikel
// (lib/data/articles/). Gebruikt door lib/data/popular-questions.ts en de
// zoeksimulatie (lib/search/simulate.ts) om AnswerPanel te voeden — zie
// docs/AI-KNOWLEDGE-STRATEGY.md §Bronvermelding voor de verplichte velden.
export const bronnen: Bron[] = [
  {
    titel: "Hoe maak je een hoofdprofiel aan",
    sectie: "Een hoofdprofiel aanmaken",
    datum: "2026-04-02",
    artikelSlug: "hoe-maak-je-een-hoofdprofiel-aan",
  },
  {
    titel: "Aan de slag met MijnLeerlijn: starten vanuit de methode of vanuit doelen",
    sectie: "Starten vanuit eigen doelen",
    datum: "2026-03-18",
    artikelSlug: "starten-vanuit-de-methode-of-vanuit-doelen",
  },
  {
    titel: "Doelenset aanmaken",
    sectie: "Een nieuwe doelenset starten",
    datum: "2026-05-10",
    artikelSlug: "doelenset-aanmaken",
  },
  {
    titel: "Doelenset koppelen aan leerlingen",
    sectie: "Een doelenset aan een groep koppelen",
    datum: "2026-05-14",
    artikelSlug: "doelenset-koppelen-aan-leerlingen",
  },
  {
    titel: "Automatisch doelen koppelen aan leerlingen",
    sectie: "Automatische koppeling instellen",
    datum: "2026-05-14",
    artikelSlug: "automatisch-doelen-koppelen-aan-leerlingen",
  },
  {
    titel: "Leerkrachten en leerlingen toevoegen aan een groep",
    sectie: "Een leerling toevoegen",
    datum: "2026-04-28",
    artikelSlug: "leerkrachten-en-leerlingen-toevoegen-aan-een-groep",
  },
  {
    titel: "Verwijder doelen bij een leerling of groep",
    sectie: "Een doel verwijderen",
    datum: "2026-04-03",
    artikelSlug: "leerling-verwijderen-uit-groep",
  },
  {
    titel: "Vaardighedenset aanmaken",
    sectie: "Een vaardighedenset opbouwen",
    datum: "2026-04-11",
    artikelSlug: "vaardighedenset-aanmaken",
  },
  {
    titel: "Vaardigheden koppelen aan leerlingen",
    sectie: "Koppelen aan een groep of leerling",
    datum: "2026-04-15",
    artikelSlug: "vaardigheden-koppelen-aan-leerlingen",
  },
  {
    titel: "Voeg een document toe aan een leerling",
    sectie: "Een document uploaden",
    datum: "2026-04-07",
    artikelSlug: "document-toevoegen-aan-leerling",
  },
  {
    titel: "Analyse: een overzicht",
    sectie: "Wat je in Analyse ziet",
    datum: "2026-05-05",
    artikelSlug: "analyse-overzicht-gebruiken",
  },
  {
    titel: "Het doelenoverzicht lezen en interpreteren",
    sectie: "Opbouw van het doelenoverzicht",
    datum: "2026-05-08",
    artikelSlug: "doelenoverzicht-lezen",
  },
  {
    titel: "Notities binnen MijnLeerlijn",
    sectie: "Een notitie toevoegen",
    datum: "2026-03-20",
    artikelSlug: "notities-binnen-mijnleerlijn",
  },
  {
    titel: "Statussets beheren",
    sectie: "Een statusset aanpassen",
    datum: "2026-04-30",
    artikelSlug: "admin-statussets-beheren",
  },
  {
    titel: "Acties automatisch genereren vanuit doelen",
    sectie: "Acties genereren",
    datum: "2026-04-13",
    artikelSlug: "acties-genereren",
  },
];

export function vindBron(artikelSlug: string, sectie: string): Bron | undefined {
  return bronnen.find((b) => b.artikelSlug === artikelSlug && b.sectie === sectie);
}
