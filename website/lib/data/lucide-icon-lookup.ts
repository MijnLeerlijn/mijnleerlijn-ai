import { iconNames as alleIconNamen, type IconName } from "lucide-react/dynamic";

// Categorie-uiterlijk (2026-07-29): enige bron van waarheid voor icoonnamen
// — `alleIconNamen` komt rechtstreeks uit lucide-react's eigen "dynamic
// icons"-subpath (1997 kebab-case namen, de volledige bibliotheek inclusief
// een paar legacy-aliassen), gebruikt door zowel de admin-picker
// (payload/components/CategorieAppearancePicker.tsx, zoeken) als de publieke
// weergave (components/atoms/CategorieIcoon.tsx, normaliseren/valideren).
// `IconName` (door lucide-react zelf geëxporteerd) is de union van alle
// geldige namen — door `populaireIconen` hiermee te typen controleert
// TypeScript zelf of elke naam daadwerkelijk bestaat.
export const iconNames: readonly IconName[] = alleIconNamen;

// Startpunt van de icon picker vóórdat er gezocht wordt (zie
// CategorieAppearancePicker.tsx) — NIET een beperking van wat opgeslagen mag
// worden, puur een curated "veelgebruikt"-snelkoppeling. Om deze lijst aan te
// passen: wijzig alleen deze array, verder nergens in de code.
export const populaireIconen: readonly IconName[] = [
  "rocket",
  "target",
  "users",
  "user",
  "school",
  "book-open",
  "award",
  "settings",
  "clipboard-list",
  "bar-chart-3",
  "calendar",
  "message-circle",
  "file-text",
  "download",
  "layers",
  "lightbulb",
  "wrench",
  "shield-check",
  "graduation-cap",
  "monitor",
  "sticky-note",
  "folder",
];

export const STANDAARD_ICOON: IconName = "file-text";

const NAAM_INDEX = new Set<string>(iconNames);

// Lucide's PascalCase-exportnamen (bv. "StickyNote", "BarChart3" — het
// formaat waarin bestaande categorieën vóór deze functie hun icoon
// opsloegen) volgen een vast patroon t.o.v. de kebab-case "dynamic
// icons"-namen: woordgrens vóór een hoofdletter, vóór een cijfer, en tussen
// een acroniem en het erop volgende woord.
function pascalNaarKebab(naam: string): string {
  return naam
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])([0-9])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

// Normaliseert een opgeslagen iconnaam naar een geldige kebab-case naam voor
// `DynamicIcon`. Nieuwe selecties via de picker zijn al kebab-case (snel
// pad); bestaande categorieën met een PascalCase-naam (het formaat van vóór
// deze functie bestond) worden hier omgezet. Onbekende of ontbrekende namen
// vallen terug op STANDAARD_ICOON — dit is de enige overgebleven
// "hardcoded" iconlogica, geen curated lijst van toegestane iconen.
export function normaliseerIconNaam(naam?: string | null): IconName {
  if (!naam || !naam.trim()) return STANDAARD_ICOON;
  const schoon = naam.trim();
  if (NAAM_INDEX.has(schoon)) return schoon as IconName;
  const kebab = pascalNaarKebab(schoon);
  if (NAAM_INDEX.has(kebab)) return kebab as IconName;
  return STANDAARD_ICOON;
}

// Leesbare weergavenaam voor de picker, bv. "sticky-note" -> "Sticky Note".
export function iconWeergavenaam(kebabNaam: string): string {
  return kebabNaam
    .split("-")
    .map((deel) => deel.charAt(0).toUpperCase() + deel.slice(1))
    .join(" ");
}
