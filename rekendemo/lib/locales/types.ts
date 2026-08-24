import type { EilandId, TaalId } from "@/lib/werkblad";

export type LokaleTaal = {
  /** Interne identifier, gelijk aan de taalkeuze in het formulier. */
  id: Extract<TaalId, "papiamento" | "papiamentu">;
  /** Naam zoals die op het eiland zelf gebruikt wordt. */
  naam: string;
  /** Korte instructie voor de generator over deze taalvariant. */
  schrijfwijze: string;
};

export type Valuta = {
  naam: string;
  code: string;
  /** Notatie zoals die in leesbare opgaven hoort te staan, bv. "Afl.". */
  notatie: string;
  voorbeeld: string;
};

/**
 * Contextcategorieën waaruit de generator situaties kiest. Bewust opgesplitst
 * per categorie: zo kan een lokale leerkracht later één categorie corrigeren
 * zonder de rest aan te raken.
 */
export type LokaleContexten = {
  dagelijks: string[];
  locaties: string[];
  etenEnProducten: string[];
  vervoer: string[];
  sportEnVrijeTijd: string[];
  natuurEnOmgeving: string[];
  wonen: string[];
  school: string[];
};

export type LokaalProfiel = {
  eiland: EilandId;
  eilandNaam: string;
  taal: LokaleTaal;
  valuta: Valuta;
  contexten: LokaleContexten;
  voornamen: string[];
  /** Eilandspecifieke zaken die vermeden moeten worden. */
  vermijden: string[];
};
