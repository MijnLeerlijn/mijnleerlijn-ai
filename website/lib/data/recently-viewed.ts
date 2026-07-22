export interface RecentBekekenItem {
  titel: string;
  sectie: string;
  bekekenOp: string;
  artikelSlug: string;
}

// Dummydata voor "Verder waar je gebleven was" (UX-DESIGN.md scherm 1,
// variant "recent-bekeken"). Zonder analytics/auth (bewust uitgesteld, zie
// IMPLEMENTATION-PLAN.md Fase 3) bestaat er nog geen echte kijkgeschiedenis
// — deze vier items zijn daarom vaste, maar inhoudelijk echte voorbeelden.
export const recentBekeken: RecentBekekenItem[] = [
  {
    titel: "Doelenset aanmaken",
    sectie: "Een nieuwe doelenset starten",
    bekekenOp: "2 dagen geleden",
    artikelSlug: "doelenset-aanmaken",
  },
  {
    titel: "Hoe maak je een hoofdprofiel aan",
    sectie: "Een hoofdprofiel aanmaken",
    bekekenOp: "5 dagen geleden",
    artikelSlug: "hoe-maak-je-een-hoofdprofiel-aan",
  },
  {
    titel: "Leerkrachten en leerlingen toevoegen aan een groep",
    sectie: "Een leerling toevoegen",
    bekekenOp: "1 week geleden",
    artikelSlug: "leerkrachten-en-leerlingen-toevoegen-aan-een-groep",
  },
  {
    titel: "Statussets beheren",
    sectie: "Een statusset aanpassen",
    bekekenOp: "1 week geleden",
    artikelSlug: "admin-statussets-beheren",
  },
];
