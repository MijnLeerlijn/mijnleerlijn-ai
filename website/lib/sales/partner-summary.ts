export interface SalesPartnerInput {
  id: string | number;
  naam?: string | null;
  doelLicenties?: number | null;
}

export interface SalesPartnerSchoolInput {
  relatiestatus: string | null;
  licenties: number;
  bronnen: string[];
}

export interface SalesPartnerSummary {
  id: string;
  naam: string;
  leads: number;
  prospects: number;
  wachtOpHandtekening: number;
  klanten: number;
  licenties: number;
  conversieNaarKlant: number | null;
  doelLicenties: number | null;
  doelPercentage: number | null;
}

function normaliseer(waarde: string): string {
  return waarde.trim().toLocaleLowerCase("nl-NL");
}

/**
 * Partnerprestatie is bewust afgeleid uit de bestaande Monday-kolom
 * `Binnengekomen via` en de actuele Relatiestatus/licenties. Er wordt geen
 * tweede CRM-waarheid opgeslagen. Alleen exacte, genormaliseerde labels
 * tellen mee; zo wordt bijvoorbeeld partner "De Rolf Groep" niet per ongeluk
 * gematcht op een andere vrije tekst waarin die woorden voorkomen.
 */
export function calculateSalesPartnerSummary(
  partners: SalesPartnerInput[],
  schools: SalesPartnerSchoolInput[],
): SalesPartnerSummary[] {
  return partners
    .map((partner) => {
      const naam = partner.naam?.trim() ?? "";
      if (!naam) return null;

      const sleutel = normaliseer(naam);
      const gekoppeld = schools.filter((school) => school.bronnen.some((bron) => normaliseer(bron) === sleutel));

      let leads = 0;
      let prospects = 0;
      let wachtOpHandtekening = 0;
      let klanten = 0;
      let licenties = 0;

      for (const school of gekoppeld) {
        if (school.relatiestatus === "Lead") leads++;
        else if (school.relatiestatus === "Prospect") prospects++;
        else if (school.relatiestatus === "Wacht op handtekening") wachtOpHandtekening++;
        else if (school.relatiestatus === "Klant") {
          klanten++;
          licenties += school.licenties;
        }
      }

      const totaalInstroom = leads + prospects + wachtOpHandtekening + klanten;
      const doelLicenties = typeof partner.doelLicenties === "number" && partner.doelLicenties > 0
        ? partner.doelLicenties
        : null;

      return {
        id: String(partner.id),
        naam,
        leads,
        prospects,
        wachtOpHandtekening,
        klanten,
        licenties,
        conversieNaarKlant: totaalInstroom > 0 ? (klanten / totaalInstroom) * 100 : null,
        doelLicenties,
        doelPercentage: doelLicenties ? (licenties / doelLicenties) * 100 : null,
      } satisfies SalesPartnerSummary;
    })
    .filter((partner): partner is SalesPartnerSummary => partner !== null)
    .sort((a, b) => b.licenties - a.licenties || b.klanten - a.klanten || a.naam.localeCompare(b.naam, "nl"));
}
