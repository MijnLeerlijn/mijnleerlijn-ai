// Pure validatiehelpers voor het contactformulier — losgetrokken van
// app/api/contact/route.ts zodat ze zonder een draaiende server/Payload
// getest kunnen worden. Zie docs/SECURITY-AND-PRIVACY.md.

export function isGeldigEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Alleen een grove categorie — nooit de volledige user-agent, zie docs/SECURITY-AND-PRIVACY.md. */
export function grofApparaat(userAgent: string | null): string {
  if (!userAgent) return "Onbekend";
  const mobiel = /iPhone/.test(userAgent) ? "iPhone" : /Android/.test(userAgent) ? "Android" : null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "onbekende browser";
  return mobiel ? `${browser} op ${mobiel}` : `${browser} op desktop`;
}

export interface RateLimiter {
  magVerder(sleutel: string): boolean;
}

/**
 * Eenvoudige in-memory sliding-window rate limiter. Losgetrokken uit de
 * route zodat het venster/maximum in tests aantoonbaar correct is — zie
 * app/api/contact/route.ts voor de bekende MVP-beperking (geen gedeelde
 * state tussen serverless-instances).
 */
export function maakRateLimiter(
  vensterMs: number,
  maxPogingen: number,
  klok: () => number = Date.now
): RateLimiter {
  const pogingenPerSleutel = new Map<string, number[]>();
  return {
    magVerder(sleutel: string): boolean {
      const nu = klok();
      const pogingen = (pogingenPerSleutel.get(sleutel) ?? []).filter((t) => nu - t < vensterMs);
      pogingen.push(nu);
      pogingenPerSleutel.set(sleutel, pogingen);
      return pogingen.length <= maxPogingen;
    },
  };
}
