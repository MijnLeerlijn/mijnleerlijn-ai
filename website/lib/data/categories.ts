export type CategorieKleur = "blauw" | "groen" | "oranje" | "geel" | "rood";

export interface Categorie {
  slug: string;
  titel: string;
  icoon: string;
  kleur: CategorieKleur;
  uitleg: string;
}

// 10 categorieën, gebaseerd op de bestaande handleidingen in handleidingen/ —
// zie docs/PROJECT.md. Geen verzonnen onderwerpen.
export const categorieen: Categorie[] = [
  {
    slug: "starten",
    titel: "Starten met MijnLeerlijn",
    icoon: "Rocket",
    kleur: "blauw",
    uitleg:
      "De eerste stappen: een hoofdprofiel aanmaken en kiezen hoe je wilt starten — vanuit de methode of vanuit je eigen doelen.",
  },
  {
    slug: "doelen-planning",
    titel: "Doelen & Planning",
    icoon: "Target",
    kleur: "blauw",
    uitleg:
      "Doelensets aanmaken, koppelen aan groepen of leerlingen, en de Doelenplanner gebruiken om onderwijs vanuit inzicht vorm te geven.",
  },
  {
    slug: "leerlingen-groepen",
    titel: "Leerlingen & Groepen",
    icoon: "Users",
    kleur: "groen",
    uitleg: "Groepen samenstellen, leerkrachten en leerlingen toevoegen, en leerlingprofielen beheren.",
  },
  {
    slug: "vaardigheden",
    titel: "Vaardigheden",
    icoon: "Award",
    kleur: "groen",
    uitleg: "Vaardighedensets aanmaken en toevoegen om naast leerdoelen ook vaardigheden te volgen.",
  },
  {
    slug: "documenten-media",
    titel: "Documenten & Media",
    icoon: "FileText",
    kleur: "oranje",
    uitleg: "Documenten toevoegen aan een leerling en overzicht houden over wat er is vastgelegd.",
  },
  {
    slug: "analyse-rapportage",
    titel: "Analyse & Rapportage",
    icoon: "BarChart3",
    kleur: "geel",
    uitleg:
      "Voortgang analyseren op leerling-, groeps- en schoolniveau, en het doelenoverzicht gebruiken voor onderbouwde keuzes.",
  },
  {
    slug: "notities",
    titel: "Notities",
    icoon: "StickyNote",
    kleur: "geel",
    uitleg:
      "Notities vastleggen bij een leerling of groep, zodat belangrijke observaties niet verloren gaan.",
  },
  {
    slug: "beheer-instellingen",
    titel: "Beheer & Instellingen",
    icoon: "Settings",
    kleur: "rood",
    uitleg:
      "Statussets, rollen en overige instellingen die de basis van jullie MijnLeerlijn-omgeving bepalen.",
  },
  {
    slug: "acties-downloads",
    titel: "Acties & Downloads",
    icoon: "Download",
    kleur: "rood",
    uitleg:
      "Acties genereren en toevoegen bij leerdoelen, en overzichten downloaden voor gebruik buiten MijnLeerlijn.",
  },
  {
    slug: "onderwijsvarianten",
    titel: "Onderwijsvarianten & Maatwerk",
    icoon: "Layers",
    kleur: "blauw",
    uitleg:
      "Hoe MijnLeerlijn meegroeit met jullie onderwijsconcept, van een reguliere methode tot montessori- of daltononderwijs.",
  },
];

export function vindCategorie(slug: string): Categorie | undefined {
  return categorieen.find((c) => c.slug === slug);
}
