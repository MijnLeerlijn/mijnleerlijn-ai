export interface UpdateItem {
  titel: string;
  badge: "Nieuw" | "Bijgewerkt";
  /** ISO-datum — weergave via lib/format/date.ts (formatDatumNL). */
  datum: string;
  artikelSlug: string;
  categorySlug: string;
}

// 5 recente updates, elk verwijzend naar een bestaand artikel — gesorteerd
// van meest naar minst recent. Gebruikt door UpdatesSection (homepage) en de
// updates-overzichtspagina (/updates). Zie docs/HOMEPAGE-VISUAL-SPEC.md §7.
export const netBijgewerkt: UpdateItem[] = [
  {
    titel: "Eerdere downloads terugvinden",
    badge: "Nieuw",
    datum: "2026-06-22",
    artikelSlug: "downloadgeschiedenis-bekijken",
    categorySlug: "acties-downloads",
  },
  {
    titel: "De periode-indeling van de school wijzigen",
    badge: "Bijgewerkt",
    datum: "2026-06-18",
    artikelSlug: "periode-indeling-wijzigen",
    categorySlug: "beheer-instellingen",
  },
  {
    titel: "Welke onderwijsvarianten zijn beschikbaar?",
    badge: "Bijgewerkt",
    datum: "2026-06-14",
    artikelSlug: "welke-varianten-zijn-beschikbaar",
    categorySlug: "onderwijsvarianten",
  },
  {
    titel: "Een rapportage exporteren",
    badge: "Nieuw",
    datum: "2026-06-12",
    artikelSlug: "rapportage-exporteren",
    categorySlug: "analyse-rapportage",
  },
  {
    titel: "Een notitie toevoegen vanaf je telefoon",
    badge: "Nieuw",
    datum: "2026-06-09",
    artikelSlug: "notitie-toevoegen-vanaf-mobiel",
    categorySlug: "notities",
  },
];
