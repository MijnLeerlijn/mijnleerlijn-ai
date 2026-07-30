import type { Payload } from "payload";

// Homepage-herontwerp (2026-07-29): telt een daadwerkelijk gestelde vraag —
// aangeroepen vanuit app/api/helpdesk/ask/route.ts, na validatie, bij ELKE
// binnenkomende aanvraag. Dat is precies de eis "alleen wanneer een
// gebruiker daadwerkelijk op Verstuur klikt": klikken op een voorbeeldvraag
// vult voortaan alleen het invoerveld (components/organisms/HelpdeskChat.tsx),
// dus een aanroep hier komt uitsluitend voor bij een bevestigde
// verstuur-actie, ongeacht of de tekst getypt of aangeklikt was.
//
// Non-blocking: zelfde patroon als loggenConversatie() in
// lib/assistant/process-public-question.ts — een mislukte telling mag het
// antwoord aan de bezoeker nooit kosten.

export function normaliseerVraag(vraag: string): string {
  return vraag.trim().replace(/\s+/g, " ").toLowerCase();
}

// Multi-brand variants (2026-07-30): `variantId` verplicht — dezelfde
// vraagtekst in twee varianten geeft twee aparte tellingen, nooit een
// gedeelde counter. De match-op-genormaliseerde-tekst zoekt daarom
// UITSLUITEND binnen deze variant (geen fallback naar lege/universele
// rijen) — een nieuw, organisch ontstaan record krijgt altijd
// `variantContext: [variantId]`, nooit leeg. Leeg blijft gereserveerd voor
// een bewust door een beheerder universeel vastgezette vraag.
export async function registreerGesteldeVraag(payload: Payload, vraagTekst: string, variantId: string): Promise<void> {
  const schoon = vraagTekst.trim();
  if (!schoon) return;
  const genormaliseerd = normaliseerVraag(schoon);

  try {
    const bestaand = await payload.find({
      collection: "helpdesk-vragen",
      where: {
        and: [{ vraagNormalized: { equals: genormaliseerd } }, { variantContext: { equals: variantId } }],
      },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    });

    const nu = new Date().toISOString();

    if (bestaand.docs[0]) {
      await payload.update({
        collection: "helpdesk-vragen",
        id: bestaand.docs[0].id,
        overrideAccess: true,
        data: {
          aantalGesteld: (bestaand.docs[0].aantalGesteld ?? 0) + 1,
          laatstGebruiktOp: nu,
        },
      });
      return;
    }

    await payload.create({
      collection: "helpdesk-vragen",
      overrideAccess: true,
      data: {
        vraag: schoon,
        vraagNormalized: genormaliseerd,
        aantalGesteld: 1,
        laatstGebruiktOp: nu,
        pinned: false,
        verborgen: false,
        variantContext: [Number(variantId)],
      },
    });
  } catch (error) {
    console.error("[registreer-gestelde-vraag] Tellen mislukt (antwoord blijft ongewijzigd):", error);
  }
}
