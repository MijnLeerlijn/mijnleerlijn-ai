import type { Payload } from "payload";
import { richTextNaarGestructureerdeTekst } from "./kennisbasis-richtext";

// Kennisbasis MijnLeerlijn — Fase 4 (2026-07-28): haalt de GEPUBLICEERDE
// stand van de centrale kennisbasis-Global op (payload/globals/
// KennisbasisMijnleerlijn.ts) voor gebruik als gegarandeerde, altijd-
// aanwezige achtergrondcontext in process-public-question.ts — nooit een
// concept (draft: false leest uitsluitend de gepubliceerde stand). Faalt
// nooit hard: bij elke fout (nog nooit gepubliceerd, lege inhoud,
// databasefout) wordt `null` teruggegeven, zelfde defensieve patroon als
// bepaal-intentie.ts — de Helpdesk AI moet altijd kunnen antwoorden op basis
// van de handleidingen alleen, ook als de centrale kennisbasis (nog) niet
// beschikbaar is.

export interface CentraleKennisbasis {
  /** Gestructureerde tekst (koppen als "## ", lijst-items als "- ") — zie kennisbasis-richtext.ts. */
  tekst: string;
  /** Tijdstempel van de gepubliceerde stand, gebruikt als versie-identifier bij het loggen. */
  versie: string;
}

export async function haalCentraleKennisbasisOp(payload: Payload): Promise<CentraleKennisbasis | null> {
  try {
    const global = await payload.findGlobal({
      slug: "kennisbasis-mijnleerlijn",
      draft: false,
      overrideAccess: true,
      depth: 0,
    });

    const status = (global as unknown as { _status?: string })._status;
    if (status !== "published") return null;

    const tekst = richTextNaarGestructureerdeTekst(global.inhoud);
    if (!tekst.trim()) return null;

    return { tekst, versie: global.updatedAt ?? "" };
  } catch {
    return null;
  }
}
