// Minimale classnames-helper. Bewust geen extra library (clsx/tailwind-merge):
// de huidige componenten combineren geen conflicterende Tailwind-classes die
// een merge-strategie nodig hebben — zie PLATFORM-FOUNDATION.md ("geen
// abstracties voor problemen die nog niet bestaan"). Her overwegen zodra dat
// wel het geval is.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
