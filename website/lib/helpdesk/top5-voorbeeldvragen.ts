import type { Payload } from "payload";

const MAX_VOORBEELDVRAGEN = 5;

interface HelpdeskVraagRij {
  vraag: string;
  pinned?: boolean | null;
  pinVolgorde?: number | null;
  aantalGesteld?: number | null;
  laatstGebruiktOp?: string | null;
}

// Homepage-herontwerp (2026-07-29): de publieke "Meest gestelde vragen" op
// de homepage — vervangt de vaste lijst uit de oude Global
// (payload/globals/HelpdeskVoorbeeldvragen.ts). Eerst alle vastgezette
// vragen (gesorteerd op pinVolgorde, dan recentst gebruikt), daarna
// aangevuld tot 5 met de meest gestelde niet-vastgezette vragen — verborgen
// vragen doen nooit mee. Zelfde return-vorm (string[]) als de vervangen
// haalVoorbeeldvragen() in app/(frontend)/(public)/page.tsx, dus
// HelpdeskChat's `voorbeeldvragen`-prop-contract blijft ongewijzigd.
export async function haalTop5VoorbeeldVragen(payload: Payload): Promise<string[]> {
  const gepind = await payload.find({
    collection: "helpdesk-vragen",
    where: { and: [{ pinned: { equals: true } }, { verborgen: { equals: false } }] },
    sort: ["pinVolgorde", "-laatstGebruiktOp"],
    limit: MAX_VOORBEELDVRAGEN,
    overrideAccess: true,
    depth: 0,
  });

  const resultaat: string[] = (gepind.docs as HelpdeskVraagRij[]).map((v) => v.vraag);

  if (resultaat.length >= MAX_VOORBEELDVRAGEN) {
    return resultaat.slice(0, MAX_VOORBEELDVRAGEN);
  }

  const aanvulling = await payload.find({
    collection: "helpdesk-vragen",
    where: { and: [{ pinned: { equals: false } }, { verborgen: { equals: false } }] },
    sort: ["-aantalGesteld", "-laatstGebruiktOp"],
    limit: MAX_VOORBEELDVRAGEN - resultaat.length,
    overrideAccess: true,
    depth: 0,
  });

  for (const rij of aanvulling.docs as HelpdeskVraagRij[]) {
    resultaat.push(rij.vraag);
  }

  return resultaat.slice(0, MAX_VOORBEELDVRAGEN);
}
