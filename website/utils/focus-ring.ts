// Gedeelde focus-ring-styling — zie docs/UI-DESIGN.md §34. Bewust geen apart
// "FocusRing"-component: een ring is pure styling zonder eigen DOM-structuur,
// dus een class-utility volstaat en voorkomt een nutteloze wrapper-component.
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--variant-accent)] focus-visible:ring-offset-2";

// Op donkere achtergronden (bv. de Hero) is een witte ring nodig voor
// voldoende contrast — zie docs/UI-DESIGN.md §34.
export const focusRingOnDark =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2";
