// Server-only fetch-wrapper naar Curriculum Werkplaats' admin-API
// (/api/beheer/**, zie ARCHITECTUUR-HELPDESK-BEHEERKOPPELING.md in de
// Curriculum Werkplaats-codebase). Wordt UITSLUITEND aangeroepen vanuit
// app/api/curriculum-beheer/[...pad]/route.ts — de browser praat nooit
// rechtstreeks met Curriculum Werkplaats, alleen met deze Helpdesk-server,
// die op zijn beurt het gedeelde secret meestuurt. Fail-closed: ontbreken de
// env vars, dan gooit elke aanroep meteen een fout (nooit stilzwijgend een
// lege/ongeautoriseerde aanroep doen).
//
// Bewust GEEN `import "server-only"` — deze Helpdesk-codebase gebruikt dat
// pakket nergens anders (ander project dan Curriculum Werkplaats, waar
// lib/beheer/*.ts dat wél consequent doet); hier zou het bovendien deze
// module ontestbaar maken onder de globale jsdom-vitest-omgeving
// (vitest.config.ts) — "server-only" gooit zodra `window` bestaat. Het
// bestand wordt hoe dan ook uitsluitend vanuit een Route Handler
// geïmporteerd (nooit in een Client Component), dus de runtime-garantie is
// hier niet nodig.

export interface CurriculumBeheerResponse {
  status: number;
  body: unknown;
}

function basisUrlEnSecret(): { basisUrl: string; secret: string } {
  const basisUrl = process.env.CURRICULUM_ADMIN_API_URL;
  const secret = process.env.CURRICULUM_ADMIN_API_SECRET;
  if (!basisUrl || !secret) {
    throw new Error(
      "CURRICULUM_ADMIN_API_URL en/of CURRICULUM_ADMIN_API_SECRET ontbreken — de beheerkoppeling met Curriculum Werkplaats is niet geconfigureerd."
    );
  }
  return { basisUrl: basisUrl.replace(/\/$/, ""), secret };
}

/**
 * Stuurt één verzoek naar Curriculum Werkplaats' `/api/beheer/{pad}`.
 * `pad` bevat GEEN leidende slash (bv. "projecten" of
 * "projecten/<id>/blokkeren") — komt direct overeen met de padstructuur
 * onder app/api/beheer/** in de Curriculum Werkplaats-codebase, dus deze
 * functie hoeft zelf geen kennis te hebben van welke actie welk pad heeft.
 */
export async function stuurCurriculumBeheerVerzoek(
  pad: string,
  opties: {
    method: "GET" | "POST" | "DELETE";
    zoek?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  }
): Promise<CurriculumBeheerResponse> {
  const { basisUrl, secret } = basisUrlEnSecret();

  const url = new URL(`${basisUrl}/api/beheer/${pad}`);
  for (const [sleutel, waarde] of Object.entries(opties.zoek ?? {})) {
    if (waarde !== undefined && waarde !== "") url.searchParams.set(sleutel, waarde);
  }

  const response = await fetch(url, {
    method: opties.method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(opties.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opties.body ? JSON.stringify(opties.body) : undefined,
    cache: "no-store",
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body };
}
