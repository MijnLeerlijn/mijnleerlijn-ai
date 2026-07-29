import type { CategorieKleur } from "@/lib/data/categories";

// Categorie-uiterlijk (2026-07-29): enige bron van waarheid voor de 9 vaste
// kleurwaarden (waarde + Nederlands label + hex voor de admin-swatches in
// payload/components/CategorieAppearancePicker.tsx — die draait, i.t.t. de
// publieke site, zonder Tailwind, zie CategorieAppearancePicker.tsx). De
// publieke Tailwind-classnamekaart (components/atoms/CategorieIcoon.tsx)
// gebruikt dezelfde 5 merk-hexwaarden hieronder (blue/green/red/orange/
// yellow, letterlijk uit app/globals.css) en dezelfde 4 aanvullende
// Tailwind-standaardkleuren (paars/teal/roze/leigrijs) — moet in sync
// blijven met deze lijst, maar kan zelf geen Tailwind-classnamen dynamisch
// uit hex afleiden (build-time class-detectie), vandaar twee aparte kaarten
// met dezelfde 9 waarden.
export const CATEGORIE_KLEUREN: readonly { value: CategorieKleur; label: string; hex: string }[] = [
  { value: "blue", label: "Blauw", hex: "#1588c9" },
  { value: "green", label: "Groen", hex: "#53ac32" },
  { value: "red", label: "Rood", hex: "#e10919" },
  { value: "orange", label: "Oranje", hex: "#ec6608" },
  { value: "yellow", label: "Geel", hex: "#fec905" },
  { value: "purple", label: "Paars", hex: "#7c3aed" },
  { value: "teal", label: "Teal", hex: "#0d9488" },
  { value: "pink", label: "Roze", hex: "#db2777" },
  { value: "slate", label: "Leigrijs", hex: "#475569" },
];

export const STANDAARD_KLEUR: CategorieKleur = "blue";

export function normaliseerKleur(kleur?: string | null): CategorieKleur {
  const gevonden = CATEGORIE_KLEUREN.find((k) => k.value === kleur);
  return gevonden ? gevonden.value : STANDAARD_KLEUR;
}
