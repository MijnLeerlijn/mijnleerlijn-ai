/** Foutsoorten van de generatielaag; de API-route vertaalt ze naar statuscodes. */
export type FoutCode = "configuratie" | "provider" | "validatie";

export class GeneratieFout extends Error {
  readonly code: FoutCode;
  readonly details: string[];

  constructor(code: FoutCode, bericht: string, details: string[] = []) {
    super(bericht);
    this.name = "GeneratieFout";
    this.code = code;
    this.details = details;
  }
}

export const configuratieFout = (bericht: string) =>
  new GeneratieFout("configuratie", bericht);

export const providerFout = (bericht: string) => new GeneratieFout("provider", bericht);

export const validatieFout = (details: string[]) =>
  new GeneratieFout("validatie", "De AI-output voldeed niet aan de eisen.", details);
