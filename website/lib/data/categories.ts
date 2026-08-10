// Categorie-uiterlijk (2026-07-29): uitgebreid van 5 Nederlandse naar 9
// Engelse, stabiele waarden — zie payload/migrations/
// 20260729_150000_categorie_kleuren_uitbreiden.ts (hernoemt de onderliggende
// Postgres-ENUM 1-op-1) en lib/data/categorie-kleuren.ts (labels/hex).
export type CategorieKleur = "blue" | "green" | "red" | "orange" | "yellow" | "purple" | "teal" | "pink" | "slate";

export interface Categorie {
  slug: string;
  titel: string;
  icoon: string;
  kleur: CategorieKleur;
  uitleg: string;
}

// 11 categorieën: de oorspronkelijke 10, gebaseerd op de bestaande
// handleidingen in handleidingen/ (zie docs/PROJECT.md), plus "Curriculum
// Werkplaats" (Helpdesk-beheerkoppeling 2026) — een echt, apart
// productonderdeel (curriculum.mijnleerlijn.chat, een losse Next.js-app)
// met zijn eigen handleiding en kennisartikelen, geen verzonnen onderwerp.
export const categorieen: Categorie[] = [
  {
    slug: "starten",
    titel: "Starten met MijnLeerlijn",
    icoon: "Rocket",
    kleur: "blue",
    uitleg:
      "De eerste stappen: een hoofdprofiel aanmaken en kiezen hoe je wilt starten — vanuit de methode of vanuit je eigen doelen.",
  },
  {
    slug: "doelen-planning",
    titel: "Doelen & Planning",
    icoon: "Target",
    kleur: "blue",
    uitleg:
      "Doelensets aanmaken, koppelen aan groepen of leerlingen, en de Doelenplanner gebruiken om onderwijs vanuit inzicht vorm te geven.",
  },
  {
    slug: "leerlingen-groepen",
    titel: "Leerlingen & Groepen",
    icoon: "Users",
    kleur: "green",
    uitleg: "Groepen samenstellen, leerkrachten en leerlingen toevoegen, en leerlingprofielen beheren.",
  },
  {
    slug: "vaardigheden",
    titel: "Vaardigheden",
    icoon: "Award",
    kleur: "green",
    uitleg: "Vaardighedensets aanmaken en toevoegen om naast leerdoelen ook vaardigheden te volgen.",
  },
  {
    slug: "documenten-media",
    titel: "Documenten & Media",
    icoon: "FileText",
    kleur: "orange",
    uitleg: "Documenten toevoegen aan een leerling en overzicht houden over wat er is vastgelegd.",
  },
  {
    slug: "analyse-rapportage",
    titel: "Analyse & Rapportage",
    icoon: "BarChart3",
    kleur: "yellow",
    uitleg:
      "Voortgang analyseren op leerling-, groeps- en schoolniveau, en het doelenoverzicht gebruiken voor onderbouwde keuzes.",
  },
  {
    slug: "notities",
    titel: "Notities",
    icoon: "StickyNote",
    kleur: "yellow",
    uitleg:
      "Notities vastleggen bij een leerling of groep, zodat belangrijke observaties niet verloren gaan.",
  },
  {
    slug: "beheer-instellingen",
    titel: "Beheer & Instellingen",
    icoon: "Settings",
    kleur: "red",
    uitleg:
      "Statussets, rollen en overige instellingen die de basis van jullie MijnLeerlijn-omgeving bepalen.",
  },
  {
    slug: "acties-downloads",
    titel: "Acties & Downloads",
    icoon: "Download",
    kleur: "red",
    uitleg:
      "Acties genereren en toevoegen bij leerdoelen, en overzichten downloaden voor gebruik buiten MijnLeerlijn.",
  },
  {
    slug: "onderwijsvarianten",
    titel: "Onderwijsvarianten & Maatwerk",
    icoon: "Layers",
    kleur: "blue",
    uitleg:
      "Hoe MijnLeerlijn meegroeit met jullie onderwijsconcept, van een reguliere methode tot montessori- of daltononderwijs.",
  },
  {
    slug: "curriculum-werkplaats",
    titel: "Curriculum Werkplaats",
    icoon: "PenTool",
    kleur: "purple",
    uitleg:
      "Samen het schoolcurriculum voorbereiden, bewerken en synchroniseren met MijnLeerlijn — van eerste import tot nieuwe ML-export.",
  },
];

export function vindCategorie(slug: string): Categorie | undefined {
  return categorieen.find((c) => c.slug === slug);
}
