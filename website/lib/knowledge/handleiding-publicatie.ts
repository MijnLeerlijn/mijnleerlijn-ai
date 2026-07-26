// Handleidingbouwer: bepaalt de publicatievelden (versie/gepubliceerdOp/
// gepubliceerdDoor) bij een save — pure functie, apart van de Payload-hook
// in payload/collections/Handleidingen.ts zodat de kernregel los te testen
// is. Regel: alleen bij de ECHTE overgang naar "gepubliceerd" (niet bij een
// volgende gewone bewerking terwijl de handleiding al gepubliceerd is)
// worden versie opgehoogd en gepubliceerdOp/gepubliceerdDoor gezet — anders
// zou dit bij elke toetsaanslag meebewegen.

export interface PublicatieVeldenInvoer {
  huidigeStatus: string | null | undefined;
  vorigeStatus: string | null | undefined;
  vorigeVersie: number | null | undefined;
  gebruikerId: number | string | null | undefined;
  nu?: () => string;
}

export interface PublicatieVeldenUitkomst {
  versie?: number;
  gepubliceerdOp?: string;
  gepubliceerdDoor?: number | string;
}

export function bepaalPublicatieVelden(invoer: PublicatieVeldenInvoer): PublicatieVeldenUitkomst {
  const wasGepubliceerd = invoer.vorigeStatus === "gepubliceerd";
  const wordtGepubliceerd = invoer.huidigeStatus === "gepubliceerd";

  if (!wordtGepubliceerd || wasGepubliceerd) return {};

  const nu = invoer.nu ?? (() => new Date().toISOString());
  const uitkomst: PublicatieVeldenUitkomst = {
    versie: (typeof invoer.vorigeVersie === "number" ? invoer.vorigeVersie : 0) + 1,
    gepubliceerdOp: nu(),
  };
  if (invoer.gebruikerId !== null && invoer.gebruikerId !== undefined) {
    uitkomst.gepubliceerdDoor = invoer.gebruikerId;
  }
  return uitkomst;
}
